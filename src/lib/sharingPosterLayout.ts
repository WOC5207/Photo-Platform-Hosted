import { homePhotoWeightScale } from "@/lib/homePhotoWeight";

export interface PosterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle as fractions of an image. */
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point as fractions of an image. */
export interface CropAnchor {
  x: number;
  y: number;
}

/** A detected subject with the extent the layout can test frames against. */
export interface PosterSubject {
  x: number;
  y: number;
  box: NormalizedBox;
}

export interface PosterLayoutInput {
  id: string;
  width: number;
  height: number;
  weight: number;
  /** Only present for photos whose crop follows the detected subject. */
  subject?: PosterSubject | null;
}

export interface PosterLayoutRect extends PosterRect {
  id: string;
}

/** The crop-related part of a composition photo entry. */
export interface PosterCropEntry {
  focalX: number;
  focalY: number;
  crop?: { mode: "auto" } | { mode: "manual"; x: number; y: number };
}

/**
 * What the layout needs to know about one poster photo. Structural, so a
 * resolved composition photo fits without this module depending on it.
 */
export interface PosterLayoutSource {
  photoId: string;
  composition: PosterCropEntry & { weight: number };
  source: {
    width: number;
    height: number;
    subject: { x: number; y: number; box: NormalizedBox | null } | null;
  } | null;
}

/**
 * The solver's input for a poster's photos. Only a crop that follows the
 * detected subject lets the solver shape its frame around it; manual and
 * legacy crops keep the aspect-only behaviour. The renderer and the ratio
 * suggestion both build their layouts from this, so they agree.
 */
export function posterLayoutItems(photos: readonly PosterLayoutSource[]): PosterLayoutInput[] {
  return photos.map((photo) => {
    const subject = photo.source?.subject;
    return {
      id: photo.photoId,
      width: photo.source?.width ?? 1,
      height: photo.source?.height ?? 1,
      weight: photo.composition.weight,
      subject:
        photo.composition.crop?.mode === "auto" && subject?.box
          ? { x: subject.x, y: subject.y, box: subject.box }
          : null
    };
  });
}

interface Candidate {
  cost: number;
  rectangles: PosterLayoutRect[];
}

interface PreparedItem {
  id: string;
  width: number;
  height: number;
  imageAspect: number;
  weightScale: number;
  subject: PosterSubject | null;
}

/**
 * How much a clipped subject costs relative to the aspect term. A 2:3 portrait
 * whose subject spans 80% of its height costs 0.81 + 3·0.44 in a 3:2 frame,
 * 0.41 + 0.50 in a square and 0 in a 2:3 frame, so portraits win taller
 * frames while the aspect term still governs once the subject fits.
 */
export const SUBJECT_CLIP_WEIGHT = 3;

function cropCost(item: PreparedItem, rect: PosterRect): number {
  const frameAspect = Math.max(0.01, rect.width / Math.max(1, rect.height));
  const retained = Math.min(item.imageAspect / frameAspect, frameAspect / item.imageAspect);
  return -Math.log(Math.max(0.01, retained)) * item.weightScale;
}

/**
 * The share of the subject box that the frame's cover crop would cut away,
 * measured with the very crop the renderer will use. Zero without a subject,
 * so layouts with no detection data are exactly what they were before.
 */
function subjectClipCost(item: PreparedItem, rect: PosterRect): number {
  if (!item.subject) return 0;
  const window = coverCropFromAnchor(
    item.width,
    item.height,
    rect.width,
    rect.height,
    item.subject,
    item.subject.box
  );
  const boxX = item.subject.box.x * item.width;
  const boxY = item.subject.box.y * item.height;
  const boxWidth = item.subject.box.width * item.width;
  const boxHeight = item.subject.box.height * item.height;
  const overlapWidth = Math.max(0, Math.min(boxX + boxWidth, window.x + window.width) - Math.max(boxX, window.x));
  const overlapHeight = Math.max(0, Math.min(boxY + boxHeight, window.y + window.height) - Math.max(boxY, window.y));
  const clipped = 1 - (overlapWidth * overlapHeight) / Math.max(1e-6, boxWidth * boxHeight);
  return SUBJECT_CLIP_WEIGHT * clipped * item.weightScale;
}

function better(current: Candidate | null, next: Candidate): Candidate {
  if (!current || next.cost < current.cost - 0.000001) return next;
  return current;
}

/**
 * Deterministic, bounded weighted partitioning for at most nine photographs.
 * Every candidate preserves input order, while each split evaluates both axes
 * and chooses the crop-friendly result: the frame shape that best matches the
 * photo's aspect and, when the photo follows a detected subject, keeps that
 * subject inside the crop. Divider gaps are removed exactly once, so frames
 * never overlap or escape the supplied rectangle.
 */
export function calculateSharingPosterLayout(
  items: PosterLayoutInput[],
  area: PosterRect,
  gap: number
): PosterLayoutRect[] {
  if (items.length === 0 || area.width <= 0 || area.height <= 0) return [];
  const safeGap = Math.max(0, gap);
  const prepared: PreparedItem[] = items.map((item) => ({
    id: item.id,
    width: item.width,
    height: item.height,
    imageAspect: Math.max(0.01, item.width / Math.max(1, item.height)),
    weightScale: homePhotoWeightScale(item.weight),
    subject: item.subject ?? null
  }));

  function solve(start: number, end: number, rect: PosterRect): Candidate {
    if (end - start === 1) {
      const item = prepared[start];
      return {
        cost: cropCost(item, rect) + subjectClipCost(item, rect),
        rectangles: [{ ...rect, id: item.id }]
      };
    }

    let best: Candidate | null = null;
    let totalWeight = 0;
    for (let index = start; index < end; index += 1) totalWeight += prepared[index].weightScale;

    let firstWeight = 0;
    for (let split = start + 1; split < end; split += 1) {
      firstWeight += prepared[split - 1].weightScale;
      const share = firstWeight / totalWeight;

      if (rect.width > safeGap + 1) {
        const usable = rect.width - safeGap;
        const firstWidth = usable * share;
        const left = solve(start, split, {
          x: rect.x,
          y: rect.y,
          width: firstWidth,
          height: rect.height
        });
        const right = solve(split, end, {
          x: rect.x + firstWidth + safeGap,
          y: rect.y,
          width: usable - firstWidth,
          height: rect.height
        });
        best = better(best, {
          cost: left.cost + right.cost,
          rectangles: [...left.rectangles, ...right.rectangles]
        });
      }

      if (rect.height > safeGap + 1) {
        const usable = rect.height - safeGap;
        const firstHeight = usable * share;
        const top = solve(start, split, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: firstHeight
        });
        const bottom = solve(split, end, {
          x: rect.x,
          y: rect.y + firstHeight + safeGap,
          width: rect.width,
          height: usable - firstHeight
        });
        best = better(best, {
          cost: top.cost + bottom.cost,
          rectangles: [...top.rectangles, ...bottom.rectangles]
        });
      }
    }

    return best ?? {
      cost: Number.POSITIVE_INFINITY,
      rectangles: prepared.slice(start, end).map((item) => ({ ...rect, id: item.id }))
    };
  }

  return solve(0, items.length, area).rectangles;
}

/** The size of the cover-crop window for a frame, in image pixels. */
export function coverCropWindow(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
): { width: number; height: number } {
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  const frameAspect = frameWidth / Math.max(1, frameHeight);
  let width = imageWidth;
  let height = imageHeight;
  if (imageAspect > frameAspect) width = imageHeight * frameAspect;
  else height = imageWidth / frameAspect;
  return { width, height };
}

/**
 * The original crop: `focalX`/`focalY` are fractions of the pannable range,
 * 0 flush left/top and 1 flush right/bottom. Kept byte-for-byte so posters
 * saved before crop modes existed render as they did.
 */
export function coverCropSource(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  focalX: number,
  focalY: number
): PosterRect {
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  const frameAspect = frameWidth / Math.max(1, frameHeight);
  let width = imageWidth;
  let height = imageHeight;
  if (imageAspect > frameAspect) width = imageHeight * frameAspect;
  else height = imageWidth / frameAspect;
  const maxX = Math.max(0, imageWidth - width);
  const maxY = Math.max(0, imageHeight - height);
  return {
    x: maxX * Math.min(1, Math.max(0, focalX)),
    y: maxY * Math.min(1, Math.max(0, focalY)),
    width,
    height
  };
}

function placeWindow(
  imageSize: number,
  windowSize: number,
  anchor: number,
  boxStart?: number,
  boxSize?: number
): number {
  let position = anchor * imageSize - windowSize / 2;
  if (boxStart !== undefined && boxSize !== undefined && boxSize * imageSize <= windowSize) {
    // The whole subject fits: keep it entirely inside the window.
    const start = boxStart * imageSize;
    const end = (boxStart + boxSize) * imageSize;
    position = Math.min(Math.max(position, end - windowSize), start);
  }
  return Math.min(Math.max(position, 0), Math.max(0, imageSize - windowSize));
}

/**
 * A cover crop centred on an image-normalized anchor and clamped to the image.
 * With a subject box that fits the window, the window is nudged so the whole
 * box stays visible. The same anchor yields a consistent crop across ratio,
 * layout and weight changes, which the pannable-range fraction does not.
 */
export function coverCropFromAnchor(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  anchor: CropAnchor,
  box?: NormalizedBox | null
): PosterRect {
  const { width, height } = coverCropWindow(imageWidth, imageHeight, frameWidth, frameHeight);
  return {
    x: placeWindow(imageWidth, width, anchor.x, box?.x, box?.width),
    y: placeWindow(imageHeight, height, anchor.y, box?.y, box?.height),
    width,
    height
  };
}

/** The anchor that reproduces a legacy focal crop for this frame shape. */
export function legacyFocalToAnchor(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  focalX: number,
  focalY: number
): CropAnchor {
  const { width, height } = coverCropWindow(imageWidth, imageHeight, frameWidth, frameHeight);
  const clampedX = Math.min(1, Math.max(0, focalX));
  const clampedY = Math.min(1, Math.max(0, focalY));
  return {
    x: (clampedX * Math.max(0, imageWidth - width) + width / 2) / imageWidth,
    y: (clampedY * Math.max(0, imageHeight - height) + height / 2) / imageHeight
  };
}

/** The anchor at the centre of a crop window. */
export function cropRectToAnchor(crop: PosterRect, imageWidth: number, imageHeight: number): CropAnchor {
  return {
    x: (crop.x + crop.width / 2) / imageWidth,
    y: (crop.y + crop.height / 2) / imageHeight
  };
}

/**
 * The one place that turns a photo entry into a crop. Drawing, dragging, the
 * subject marker and the layout penalty all go through it, so they agree.
 */
export function resolvePosterCrop(
  entry: PosterCropEntry,
  subject: { x: number; y: number; box: NormalizedBox | null } | null,
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
): PosterRect {
  const crop = entry.crop;
  if (!crop) {
    return coverCropSource(imageWidth, imageHeight, frameWidth, frameHeight, entry.focalX, entry.focalY);
  }
  if (crop.mode === "manual") {
    return coverCropFromAnchor(imageWidth, imageHeight, frameWidth, frameHeight, { x: crop.x, y: crop.y });
  }
  return coverCropFromAnchor(
    imageWidth,
    imageHeight,
    frameWidth,
    frameHeight,
    subject ? { x: subject.x, y: subject.y } : { x: 0.5, y: 0.5 },
    subject?.box ?? null
  );
}

export interface SharingPosterFooterGeometry {
  margin: number;
  fontSize: number;
  lineHeight: number;
  photoArea: PosterRect;
  /** Top of the first credits line. */
  textY: number;
  footerTooTall: boolean;
}

/**
 * Split the canvas into the photo area and the credits footer. Pure, so the
 * spacing can be tested without a canvas.
 *
 * A poster saved before `textGapPercent` existed reproduces its previous
 * spacing exactly: the footer's padding was derived from the margin and the
 * font size, and the gap between the frames and the text was that padding plus
 * the outer margin, which could not be lowered independently. With the field
 * present the gap is what the owner set, and the footer's bottom inset equals
 * the outer margin so the credits sit symmetrically inside the poster.
 */
export function sharingPosterFooterGeometry(input: {
  width: number;
  height: number;
  lineCount: number;
  marginPercent: number;
  footerTextPercent: number;
  textGapPercent?: number;
}): SharingPosterFooterGeometry {
  const { width, height, lineCount } = input;
  const margin = (width * input.marginPercent) / 100;
  const fontSize = Math.max(11, (width * input.footerTextPercent) / 100);
  const lineHeight = fontSize * 1.38;
  let photoHeight: number;
  let textY: number;
  if (lineCount === 0) {
    // No credit lines: no footer, so the photographs keep even margins.
    photoHeight = height - margin * 2;
    textY = height - margin;
  } else if (input.textGapPercent === undefined) {
    const footerPadding = Math.max(margin * 0.8, fontSize * 0.8);
    const footerHeight = lineCount * lineHeight + footerPadding * 2;
    photoHeight = height - footerHeight - margin * 2;
    textY = height - footerHeight + footerPadding;
  } else {
    const textGap = (width * input.textGapPercent) / 100;
    photoHeight = height - margin - textGap - lineCount * lineHeight - margin;
    textY = margin + photoHeight + textGap;
  }
  return {
    margin,
    fontSize,
    lineHeight,
    photoArea: {
      x: margin,
      y: margin,
      width: Math.max(1, width - margin * 2),
      height: Math.max(1, photoHeight)
    },
    textY,
    footerTooTall: photoHeight < Math.max(height * 0.22, fontSize * 4)
  };
}
