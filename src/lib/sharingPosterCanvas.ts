import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";
import { sharingPosterCreditLines } from "@/lib/sharingPoster";
import {
  calculateSharingPosterLayout,
  coverCropSource,
  type PosterLayoutRect
} from "@/lib/sharingPosterLayout";

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
  } = {}
): SharingPosterRenderResult {
  const margin = (width * composition.style.marginPercent) / 100;
  const gap = (width * composition.style.gapPercent) / 100;
  const fontSize = Math.max(11, (width * composition.style.footerTextPercent) / 100);
  const lineHeight = fontSize * 1.38;
  const textWidth = Math.max(1, width - margin * 2);

  context.save();
  context.fillStyle = composition.style.backgroundColor;
  context.fillRect(0, 0, width, height);
  context.font = `600 ${fontSize}px "Avenir Next", "Segoe UI", "Microsoft YaHei", sans-serif`;
  context.textBaseline = "top";
  const lines = sharingPosterCreditLines(composition).flatMap((line) =>
    wrapLine(context, line, textWidth)
  );
  const footerPadding = Math.max(margin * 0.8, fontSize * 0.8);
  const footerHeight = lines.length * lineHeight + footerPadding * 2;
  const photoHeight = height - footerHeight - margin * 2;
  const photoArea = {
    x: margin,
    y: margin,
    width: Math.max(1, width - margin * 2),
    height: Math.max(1, photoHeight)
  };
  const layoutItems = photos.map((photo) => ({
    id: photo.photoId,
    width: photo.source?.width ?? 1,
    height: photo.source?.height ?? 1,
    weight: photo.composition.weight
  }));
  const rectangles =
    options.rectangles ?? calculateSharingPosterLayout(layoutItems, photoArea, gap);

  for (const rect of rectangles) {
    const resolved = photos.find((photo) => photo.photoId === rect.id);
    const image = images.get(rect.id);
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    if (resolved?.source && image?.complete && image.naturalWidth > 0) {
      const crop = coverCropSource(
        image.naturalWidth,
        image.naturalHeight,
        rect.width,
        rect.height,
        resolved.composition.focalX,
        resolved.composition.focalY
      );
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
    if (options.selectedPhotoId === rect.id) {
      context.save();
      context.strokeStyle = options.selectionColor ?? "#a44f25";
      context.lineWidth = Math.max(2, width / 300);
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
    }
  }

  context.fillStyle = composition.style.textColor;
  context.font = `600 ${fontSize}px "Avenir Next", "Segoe UI", "Microsoft YaHei", sans-serif`;
  let textY = height - footerHeight + footerPadding;
  for (const line of lines) {
    context.fillText(line, margin, textY);
    textY += lineHeight;
  }
  context.restore();
  return {
    rectangles,
    footerTooTall: photoHeight < Math.max(height * 0.22, fontSize * 4),
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
