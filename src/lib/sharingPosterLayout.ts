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

/**
 * How a photograph sits in its frame. "fill" crops it to cover the frame (the
 * original behaviour, and what a poster saved without the setting uses);
 * "whole" shows the entire photograph, scaled to fit inside its frame, and
 * leaves the rest of the frame to the background; "collage" sizes every frame
 * to its photograph's exact shape and packs them with even gutters (see
 * `calculateCollageLayout`).
 */
export type PosterFit = "fill" | "whole" | "collage";

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
export function posterLayoutItems(
  photos: readonly PosterLayoutSource[],
  fit: PosterFit = "fill"
): PosterLayoutInput[] {
  return photos.map((photo) => {
    const subject = photo.source?.subject;
    return {
      id: photo.photoId,
      width: photo.source?.width ?? 1,
      height: photo.source?.height ?? 1,
      weight: photo.composition.weight,
      // A whole photograph is never cropped, so no subject can be cut off.
      subject:
        fit === "fill" && photo.composition.crop?.mode === "auto" && subject?.box
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

/**
 * How strongly a whole photograph's drawn size is held to its visual weight.
 * Shape-aware shares let frames hug their photographs, and on their own would
 * let one photograph shrink to a thumbnail so the others fill theirs.
 */
export const WHOLE_SIZE_BALANCE_WEIGHT = 0.5;

/**
 * Squared log of how far a whole photograph's drawn area is from its weight's
 * share of the photo area. Uniform shrinking costs every layout the same, so
 * only the balance between photographs matters.
 */
function sizeBalanceCost(item: PreparedItem, rect: PosterRect, totalArea: number, totalWeight: number): number {
  const frameAspect = Math.max(0.01, rect.width / Math.max(1, rect.height));
  const filled = Math.min(item.imageAspect / frameAspect, frameAspect / item.imageAspect);
  const drawn = Math.max(1e-6, rect.width * rect.height * filled);
  const expected = Math.max(1e-6, (totalArea * item.weightScale) / Math.max(1e-6, totalWeight));
  const deviation = Math.log(drawn / expected);
  return WHOLE_SIZE_BALANCE_WEIGHT * deviation * deviation * item.weightScale;
}

/** The share halfway, geometrically, between two shares of the same split. */
function blendShare(a: number, b: number): number {
  const first = Math.sqrt(a * b);
  const second = Math.sqrt((1 - a) * (1 - b));
  return first / Math.max(1e-9, first + second);
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
 *
 * With `fit` "whole" nothing is cropped, so a frame that does not match its
 * photograph's shape shows as empty space around it. Each split then sizes its
 * two sides halfway (geometrically) between their weight and the room their
 * photographs' shapes need: side by side, their summed aspect ratios, as a row
 * of the same height would; stacked, their summed inverse aspect ratios, as a
 * column of the same width would. Visual weight still counts, and frames hug
 * the photographs far more closely than weight alone.
 */
export function calculateSharingPosterLayout(
  items: PosterLayoutInput[],
  area: PosterRect,
  gap: number,
  fit: PosterFit = "fill"
): PosterLayoutRect[] {
  if (fit === "collage") return calculateCollageLayout(items, area, gap);
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

  const totalWeightScale = prepared.reduce((sum, item) => sum + item.weightScale, 0);

  function solve(start: number, end: number, rect: PosterRect): Candidate {
    if (end - start === 1) {
      const item = prepared[start];
      return {
        cost:
          cropCost(item, rect) +
          subjectClipCost(item, rect) +
          (fit === "whole" ? sizeBalanceCost(item, rect, area.width * area.height, totalWeightScale) : 0),
        rectangles: [{ ...rect, id: item.id }]
      };
    }

    let best: Candidate | null = null;
    let totalWeight = 0;
    for (let index = start; index < end; index += 1) totalWeight += prepared[index].weightScale;

    let totalAspect = 0;
    let totalInverse = 0;
    for (let index = start; index < end; index += 1) {
      totalAspect += prepared[index].imageAspect;
      totalInverse += 1 / prepared[index].imageAspect;
    }

    let firstWeight = 0;
    let firstAspect = 0;
    let firstInverse = 0;
    for (let split = start + 1; split < end; split += 1) {
      firstWeight += prepared[split - 1].weightScale;
      firstAspect += prepared[split - 1].imageAspect;
      firstInverse += 1 / prepared[split - 1].imageAspect;
      const share = firstWeight / totalWeight;
      const rowShare = fit === "whole" ? blendShare(share, firstAspect / totalAspect) : share;
      const columnShare = fit === "whole" ? blendShare(share, firstInverse / totalInverse) : share;

      if (rect.width > safeGap + 1) {
        const usable = rect.width - safeGap;
        const firstWidth = usable * rowShare;
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
        const firstHeight = usable * columnShare;
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

/**
 * Where a whole photograph sits inside its frame: as large as fits, the
 * photograph's own shape, centred unless `align` says otherwise (0 flush
 * left/top, 1 flush right/bottom). The layout's aspect cost is the same
 * measure as for a crop (`-ln` of the share kept), here the share of the frame
 * the photograph fills, so frames still follow the photographs' shapes.
 */
export function containFrame(
  imageWidth: number,
  imageHeight: number,
  frame: PosterRect,
  align: { x: number; y: number } = { x: 0.5, y: 0.5 }
): PosterRect {
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  const frameAspect = frame.width / Math.max(1e-6, frame.height);
  const width = imageAspect > frameAspect ? frame.width : frame.height * imageAspect;
  const height = imageAspect > frameAspect ? frame.width / imageAspect : frame.height;
  return {
    x: frame.x + (frame.width - width) * Math.min(1, Math.max(0, align.x)),
    y: frame.y + (frame.height - height) * Math.min(1, Math.max(0, align.y)),
    width,
    height
  };
}

/**
 * Where a whole photograph should sit in its frame so the photographs gather
 * toward the middle of the photo area: a frame left of the middle pushes its
 * photograph right, one across the middle centres it. Spare room then collects
 * at the poster's edges, where the gradient reads as a backdrop, rather than
 * as uneven gutters between neighbours.
 */
export function gatherAlignment(frame: PosterRect, area: PosterRect): { x: number; y: number } {
  const towards = (start: number, size: number, areaStart: number, areaSize: number) =>
    Math.min(1, Math.max(0, 0.5 + (areaStart + areaSize / 2 - (start + size / 2)) / Math.max(1e-6, size)));
  return {
    x: towards(frame.x, frame.width, area.x, area.width),
    y: towards(frame.y, frame.height, area.y, area.height)
  };
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

/**
 * One way to arrange a run of photographs as a shape-exact block. With gutters
 * of a fixed size a block's height is an affine function of its width,
 * `height = slope * width + offset`, which composes exactly: side by side the
 * two children share a height and split the width less one gutter; stacked
 * they share the width and add their heights and one gutter. `shares` is each
 * photograph's share of the block's area ignoring gutters, used to judge how
 * evenly a tree sizes the photographs before it is placed.
 */
interface CollageTree {
  slope: number;
  offset: number;
  /** Gutter-free aspect ratio (width / height), for bucketing candidates. */
  aspect: number;
  /** ln(area share) of each photograph, in order. */
  logShares: number[];
  /** How unevenly the tree sizes its photographs against their weights. */
  imbalance: number;
  node: { leaf: number } | { axis: "row" | "column"; first: CollageTree; second: CollageTree };
}

/** Candidates kept per run of photographs: one per aspect bucket. */
const COLLAGE_BUCKETS_PER_OCTAVE = 6;
const COLLAGE_MAX_CANDIDATES = 48;
/** Weight of size imbalance against empty space when choosing a collage. */
export const COLLAGE_BALANCE_WEIGHT = 0.6;

function collageImbalance(logShares: number[], logWeights: number[]): number {
  // Spread of ln(share / weight share): zero when every photograph's area is
  // exactly proportional to its weight, whatever the overall scale.
  const deviations = logShares.map((share, index) => share - logWeights[index]);
  const mean = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  return deviations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deviations.length;
}

function combineCollage(
  first: CollageTree,
  second: CollageTree,
  axis: "row" | "column",
  gap: number,
  logWeights: number[]
): CollageTree {
  let slope: number;
  let offset: number;
  let aspect: number;
  let firstShare: number;
  if (axis === "row") {
    // h = s1*w1 + o1 = s2*w2 + o2 with w1 + w2 = w - gap.
    const total = first.slope + second.slope;
    slope = (first.slope * second.slope) / total;
    offset = (first.slope * (second.offset - second.slope * gap) + second.slope * first.offset) / total;
    aspect = first.aspect + second.aspect;
    firstShare = first.aspect / aspect;
  } else {
    slope = first.slope + second.slope;
    offset = first.offset + second.offset + gap;
    aspect = 1 / (1 / first.aspect + 1 / second.aspect);
    firstShare = (1 / first.aspect) / (1 / first.aspect + 1 / second.aspect);
  }
  const logShares = [
    ...first.logShares.map((share) => share + Math.log(firstShare)),
    ...second.logShares.map((share) => share + Math.log(1 - firstShare))
  ];
  return {
    slope,
    offset,
    aspect,
    logShares,
    imbalance: collageImbalance(logShares, logWeights),
    node: { axis, first, second }
  };
}

/** Keep the most even tree in each aspect bucket, then the most even buckets. */
function pruneCollage(candidates: CollageTree[]): CollageTree[] {
  const buckets = new Map<number, CollageTree>();
  for (const candidate of candidates) {
    const bucket = Math.round(Math.log2(candidate.aspect) * COLLAGE_BUCKETS_PER_OCTAVE);
    const kept = buckets.get(bucket);
    if (!kept || candidate.imbalance < kept.imbalance - 1e-12) buckets.set(bucket, candidate);
  }
  return [...buckets.values()]
    .sort((a, b) => a.imbalance - b.imbalance)
    .slice(0, COLLAGE_MAX_CANDIDATES);
}

function placeCollage(tree: CollageTree, x: number, y: number, width: number, gap: number, out: PosterRect[]): void {
  const height = tree.slope * width + tree.offset;
  if ("leaf" in tree.node) {
    out[tree.node.leaf] = { x, y, width, height };
    return;
  }
  const { axis, first, second } = tree.node;
  if (axis === "column") {
    const firstHeight = first.slope * width + first.offset;
    placeCollage(first, x, y, width, gap, out);
    placeCollage(second, x, y + firstHeight + gap, width, gap, out);
    return;
  }
  const firstWidth = (height - first.offset) / first.slope;
  placeCollage(first, x, y, firstWidth, gap, out);
  placeCollage(second, x + firstWidth + gap, y, Math.max(0, width - firstWidth - gap), gap, out);
}

/**
 * A packed collage block: `height = slope * width + offset` for any width, and
 * how unevenly it sizes the photographs for their weights.
 */
export interface CollageBlock {
  slope: number;
  offset: number;
  imbalance: number;
}

/**
 * The arrangements worth considering for `items` as one collage block, the
 * most even per shape. Exposed so the adaptive ratio can pick the poster
 * shape a block fills exactly.
 */
export function collageBlocks(items: PosterLayoutInput[], gap: number): CollageBlock[] {
  return collageTrees(items, Math.max(0, gap));
}

function collageTrees(items: PosterLayoutInput[], safeGap: number): CollageTree[] {
  if (items.length === 0) return [];
  const logWeights = items.map((item) => Math.log(homePhotoWeightScale(item.weight)));
  const count = items.length;
  const runs: CollageTree[][][] = Array.from({ length: count }, () => new Array(count + 1));
  for (let index = 0; index < count; index += 1) {
    const aspect = Math.max(0.05, items[index].width / Math.max(1, items[index].height));
    runs[index][index + 1] = [
      { slope: 1 / aspect, offset: 0, aspect, logShares: [0], imbalance: 0, node: { leaf: index } }
    ];
  }
  for (let length = 2; length <= count; length += 1) {
    for (let start = 0; start + length <= count; start += 1) {
      const end = start + length;
      const runWeights = logWeights.slice(start, end);
      const candidates: CollageTree[] = [];
      for (let split = start + 1; split < end; split += 1) {
        for (const first of runs[start][split]) {
          for (const second of runs[split][end]) {
            candidates.push(combineCollage(first, second, "row", safeGap, runWeights));
            candidates.push(combineCollage(first, second, "column", safeGap, runWeights));
          }
        }
      }
      runs[start][end] = pruneCollage(candidates);
    }
  }
  return runs[0][count];
}

/**
 * The collage layout: every photograph whole, in its own shape, with gutters
 * of exactly `gap` between neighbours, packed as one block and centred in
 * `area`. Order is kept. Of the arrangements found, the chosen one balances
 * how much of the area the block covers against how evenly it sizes the
 * photographs for their weights. Spare room is left around the block, where
 * the glass gradient fills it, rather than inside frames.
 */
export function calculateCollageLayout(
  items: PosterLayoutInput[],
  area: PosterRect,
  gap: number
): PosterLayoutRect[] {
  if (items.length === 0 || area.width <= 0 || area.height <= 0) return [];
  const safeGap = Math.max(0, gap);
  const count = items.length;
  let best: { cost: number; tree: CollageTree; width: number } | null = null;
  for (const tree of collageTrees(items, safeGap)) {
    // As wide as the area allows without overflowing its height.
    let width = area.width;
    if (tree.slope * width + tree.offset > area.height) width = (area.height - tree.offset) / tree.slope;
    if (!(width > 0)) continue;
    const height = tree.slope * width + tree.offset;
    const coverage = Math.min(1, (width * height) / (area.width * area.height));
    const cost = -Math.log(Math.max(0.01, coverage)) + COLLAGE_BALANCE_WEIGHT * tree.imbalance;
    if (!best || cost < best.cost - 1e-12) best = { cost, tree, width };
  }
  if (!best) return calculateSharingPosterLayout(items, area, gap, "whole");

  const height = best.tree.slope * best.width + best.tree.offset;
  const rects: PosterRect[] = new Array(count);
  placeCollage(
    best.tree,
    area.x + (area.width - best.width) / 2,
    area.y + (area.height - height) / 2,
    best.width,
    safeGap,
    rects
  );
  return rects.map((rect, index) => ({ ...rect, id: items[index].id }));
}

/** Where the credits can align: the photographs' left edge, their centre, their right edge. */
export const CREDITS_SNAP_POSITIONS = [0, 0.5, 1] as const;

/**
 * The horizontal extent the credits align to: from the leftmost photograph's
 * left edge to the rightmost one's right edge, so text lines up with the
 * photographs even when a collage is narrower than the margins allow.
 * `fallback` (the margins) when no photograph is placed.
 */
export function creditsSpan(
  photoRects: readonly PosterRect[],
  fallback: { left: number; right: number }
): { left: number; right: number } {
  if (photoRects.length === 0) return fallback;
  return {
    left: Math.min(...photoRects.map((rect) => rect.x)),
    right: Math.max(...photoRects.map((rect) => rect.x + rect.width))
  };
}

/**
 * Where a credits line of `lineWidth` starts for a text `position` from 0 to
 * 1: 0 is flush with the span's left edge, 1 flush with its right edge, 0.5
 * centred, and values between slide smoothly, so every line keeps the same
 * alignment as the block moves. Kept inside `bounds` (the margins), so a line
 * wider than a narrow collage never leaves the poster.
 */
export function creditLineX(
  span: { left: number; right: number },
  lineWidth: number,
  position: number,
  bounds: { left: number; right: number }
): number {
  const clamped = Math.min(1, Math.max(0, position));
  const x = span.left + (span.right - span.left - lineWidth) * clamped;
  return Math.min(Math.max(x, bounds.left), Math.max(bounds.left, bounds.right - lineWidth));
}

/**
 * A dragged text position, snapped to the nearest alignment when the block is
 * within `threshold` pixels of it. `travel` is how far, in pixels, the block
 * moves from position 0 to 1 (the span less the block's width).
 */
export function snapCreditsPosition(
  position: number,
  travel: number,
  threshold: number
): { position: number; snapped: (typeof CREDITS_SNAP_POSITIONS)[number] | null } {
  const clamped = Math.min(1, Math.max(0, position));
  let best: (typeof CREDITS_SNAP_POSITIONS)[number] | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of CREDITS_SNAP_POSITIONS) {
    const distance = Math.abs(clamped - target) * Math.max(0, travel);
    if (distance <= threshold && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best === null ? { position: clamped, snapped: null } : { position: best, snapped: best };
}
