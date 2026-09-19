import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";
import { sharingPosterCreditLines } from "@/lib/sharingPoster";
import {
  calculateSharingPosterLayout,
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
  rectangles: PosterLayoutRect[];
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
  const rectangles =
    options.rectangles ??
    calculateSharingPosterLayout(posterLayoutItems(photos), geometry.photoArea, gap);

  // Resolve every frame's crop up front: the glass background takes its
  // colours from exactly what each frame shows, so both use the same window.
  const crops = new Map<string, PosterRect>();
  for (const rect of rectangles) {
    const resolved = photos.find((photo) => photo.photoId === rect.id);
    const image = images.get(rect.id);
    if (resolved?.source && image?.complete && image.naturalWidth > 0) {
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
    paintGlassBackground(context, width, height, rectangles, crops, images, {
      colour: style.backgroundColor,
      blurPercent: style.background.blurPercent,
      tintOpacity: style.background.tintOpacity
    });
  if (!glass) {
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, width, height);
  }

  for (const rect of rectangles) {
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
    if (options.subjectMarkerPhotoId === rect.id && image && crop) {
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
    if (glass) {
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
