import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";
import { sharingPosterCreditLines, sharingPosterFit } from "@/lib/sharingPoster";
import {
  calculateSharingPosterLayout,
  containFrame,
  gatherAlignment,
  posterLayoutItems,
  resolvePosterCrop,
  sharingPosterFooterGeometry,
  type PosterLayoutRect,
  type PosterRect
} from "@/lib/sharingPosterLayout";
import { paintGlassBackground, withAlpha } from "@/lib/sharingPosterGlass";

// The footer geometry is pure layout arithmetic and lives with the layout; it
// is re-exported so existing imports keep working.
export { sharingPosterFooterGeometry, type SharingPosterFooterGeometry } from "@/lib/sharingPosterLayout";

export interface SharingPosterRenderResult {
  /** The layout's frames. */
  rectangles: PosterLayoutRect[];
  /**
   * Where each photograph is drawn: its frame when cropped to fill, the
   * centred whole photograph inside it otherwise.
   */
  photoRects: PosterLayoutRect[];
  footerTooTall: boolean;
  wrappedLineCount: number;
}

function wrapLine(
  context: CanvasRenderingContext2D,
  line: string,
  maxWidth: number
): string[] {
  const sourceLines = line.split("\n");
  const wrapped: string[] = [];
  for (const source of sourceLines) {
    if (!source) {
      wrapped.push("");
      continue;
    }
    let current = "";
    for (const character of Array.from(source)) {
      const candidate = current + character;
      if (current && context.measureText(candidate).width > maxWidth) {
        wrapped.push(current);
        current = character;
      } else {
        current = candidate;
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

export function renderSharingPoster(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  composition: SharingPosterComposition,
  photos: SharingPosterResolvedPhoto[],
  images: Map<string, HTMLImageElement>,
  options: {
    selectedPhotoId?: string | null;
    selectionColor?: string;
    rectangles?: PosterLayoutRect[];
    unavailableLabel?: string;
    /** Preview only: ring the detected subject of this photo when its crop follows it. */
    subjectMarkerPhotoId?: string | null;
  } = {}
): SharingPosterRenderResult {
  const { style } = composition;
  const margin = (width * style.marginPercent) / 100;
  const gap = (width * style.gapPercent) / 100;
  const fontSize = Math.max(11, (width * style.footerTextPercent) / 100);
  const textWidth = Math.max(1, width - margin * 2);

  context.save();
  context.font = `600 ${fontSize}px "Avenir Next", "Segoe UI", "Microsoft YaHei", sans-serif`;
  context.textBaseline = "top";
  const lines = sharingPosterCreditLines(composition).flatMap((line) =>
    wrapLine(context, line, textWidth)
  );
  const geometry = sharingPosterFooterGeometry({
    width,
    height,
    lineCount: lines.length,
    marginPercent: style.marginPercent,
    footerTextPercent: style.footerTextPercent,
    textGapPercent: style.textGapPercent
  });
  const fit = sharingPosterFit(style);
  const rectangles =
    options.rectangles ??
    calculateSharingPosterLayout(posterLayoutItems(photos, fit), geometry.photoArea, gap, fit);

  // Resolve every photograph's crop and placement up front: the glass
  // background takes its colours from exactly what each photograph shows and
  // flows out from where it is drawn, so all three use the same values. A
  // whole photograph is placed from the gallery's dimensions when known, so
  // the preview rendition and the full one land on the same rectangle.
  const crops = new Map<string, PosterRect>();
  const photoRects: PosterLayoutRect[] = [];
  for (const rect of rectangles) {
    const resolved = photos.find((photo) => photo.photoId === rect.id);
    const image = images.get(rect.id);
    const loaded = Boolean(resolved?.source && image?.complete && image.naturalWidth > 0);
    if (fit !== "fill" && resolved?.source) {
      const sourceWidth = resolved.source.width > 0 ? resolved.source.width : image?.naturalWidth ?? 1;
      const sourceHeight = resolved.source.height > 0 ? resolved.source.height : image?.naturalHeight ?? 1;
      photoRects.push({
        ...containFrame(sourceWidth, sourceHeight, rect, gatherAlignment(rect, geometry.photoArea)),
        id: rect.id
      });
      if (image && loaded) {
        crops.set(rect.id, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight });
      }
      continue;
    }
    photoRects.push(rect);
    if (resolved?.source && image && loaded) {
      crops.set(
        rect.id,
        resolvePosterCrop(
          resolved.composition,
          resolved.source.subject,
          image.naturalWidth,
          image.naturalHeight,
          rect.width,
          rect.height
        )
      );
    }
  }

  const glass =
    style.background?.mode === "glass" &&
    paintGlassBackground(context, width, height, photoRects, crops, images, {
      colour: style.backgroundColor,
      blurPercent: style.background.blurPercent,
      tintOpacity: style.background.tintOpacity,
      // Shadows lift a frame off the glass; around a whole photograph they
      // would draw the very box the gradient is there to dissolve.
      shadows: fit === "fill"
    });
  if (!glass) {
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, width, height);
  }

  for (const rect of photoRects) {
    const image = images.get(rect.id);
    const crop = crops.get(rect.id);
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    if (image && crop) {
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );
    } else {
      context.fillStyle = "#d9d4ca";
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.fillStyle = "#514a41";
      context.font = `600 ${Math.max(11, fontSize * 0.8)}px sans-serif`;
      context.fillText(options.unavailableLabel ?? "Image unavailable", rect.x + gap + 4, rect.y + gap + 4);
    }
    context.restore();
    if (fit === "fill" && options.subjectMarkerPhotoId === rect.id && image && crop) {
      const resolved = photos.find((photo) => photo.photoId === rect.id);
      const subject = resolved?.composition.crop?.mode === "auto" ? resolved.source?.subject : null;
      if (subject) {
        const markerX = rect.x + ((subject.x * image.naturalWidth - crop.x) * rect.width) / crop.width;
        const markerY = rect.y + ((subject.y * image.naturalHeight - crop.y) * rect.height) / crop.height;
        const radius = Math.max(6, width / 150);
        context.save();
        context.beginPath();
        context.rect(rect.x, rect.y, rect.width, rect.height);
        context.clip();
        context.beginPath();
        context.arc(markerX, markerY, radius, 0, Math.PI * 2);
        context.lineWidth = Math.max(4, width / 225);
        context.strokeStyle = "rgba(255, 255, 255, 0.9)";
        context.stroke();
        context.lineWidth = Math.max(2, width / 450);
        context.strokeStyle = options.selectionColor ?? "#a44f25";
        context.stroke();
        context.restore();
      }
    }
    if (glass && fit === "fill") {
      // Glass hides the frame boundary, so lift each frame with the same faint
      // inset line the site uses on image frames.
      context.save();
      context.strokeStyle = withAlpha(style.textColor, 0.12);
      context.lineWidth = Math.max(1, width / 900);
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
    }
    if (options.selectedPhotoId === rect.id) {
      context.save();
      context.strokeStyle = options.selectionColor ?? "#a44f25";
      context.lineWidth = Math.max(2, width / 300);
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
    }
  }

  context.fillStyle = style.textColor;
  context.font = `600 ${fontSize}px "Avenir Next", "Segoe UI", "Microsoft YaHei", sans-serif`;
  let textY = geometry.textY;
  for (const line of lines) {
    context.fillText(line, margin, textY);
    textY += geometry.lineHeight;
  }
  context.restore();
  return {
    rectangles,
    photoRects,
    footerTooTall: geometry.footerTooTall,
    wrappedLineCount: lines.length
  };
}

export async function loadPosterImages(
  photos: SharingPosterResolvedPhoto[],
  rendition: "preview" | "full",
  concurrency = 2
): Promise<Map<string, HTMLImageElement>> {
  const result = new Map<string, HTMLImageElement>();
  let cursor = 0;
  async function worker() {
    while (cursor < photos.length) {
      const photo = photos[cursor++];
      const url = rendition === "full" ? photo.source?.fullUrl : photo.source?.previewUrl;
      if (!url) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      try {
        await image.decode();
        result.set(photo.photoId, image);
      } catch {
        // Unavailable images remain explicit placeholders in the editor.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, photos.length)) }, () => worker())
  );
  return result;
}
