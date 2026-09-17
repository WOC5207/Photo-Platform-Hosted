import type { PosterLayoutRect, PosterRect } from "@/lib/sharingPosterLayout";

/**
 * The "liquid glass" poster background: every frame's outermost pixels are
 * stretched out to the canvas edges, the whole layer is blurred, and the
 * poster's background colour is laid over it. The look follows the site's own
 * blurred backdrop (see ScrollBlurBackground and the album lightbox).
 *
 * Everything heavier than a single drawImage happens on a layer about
 * GLASS_LAYER_WIDTH pixels wide, so the cost is the same for the 900 px
 * preview and a 12 MP export. The blur is a downsample/upsample pyramid rather
 * than `context.filter`, which keeps one code path for every browser; engines
 * resample slightly differently, so the effect can differ marginally between
 * browsers but is stable within a session, which is what preview and export
 * need.
 */

export type GlassEdge =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

export interface GlassEdgeStrip {
  edge: GlassEdge;
  dest: PosterRect;
}

/** Width of the working layer the blur runs on. */
export const GLASS_LAYER_WIDTH = 240;

export interface GlassBackgroundOptions {
  /** The poster's background colour: the base fill and the tint. */
  colour: string;
  blurPercent: number;
  tintOpacity: number;
}

/**
 * The eight regions a frame's edges extend into: a strip reaching the canvas
 * edge beside each side, and the four corners between them. With the frame
 * itself they tile `bounds` exactly, so painting frames in draw order lets a
 * later frame overwrite an earlier one's extension where the two compete.
 */
export function glassEdgeStrips(rect: PosterRect, bounds: PosterRect): GlassEdgeStrip[] {
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const x1 = rect.x;
  const y1 = rect.y;
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  const strip = (edge: GlassEdge, x: number, y: number, width: number, height: number): GlassEdgeStrip => ({
    edge,
    dest: { x, y, width: Math.max(0, width), height: Math.max(0, height) }
  });
  return [
    strip("top", x1, top, rect.width, y1 - top),
    strip("bottom", x1, y2, rect.width, bottom - y2),
    strip("left", left, y1, x1 - left, rect.height),
    strip("right", x2, y1, right - x2, rect.height),
    strip("topLeft", left, top, x1 - left, y1 - top),
    strip("topRight", x2, top, right - x2, y1 - top),
    strip("bottomLeft", left, y2, x1 - left, bottom - y2),
    strip("bottomRight", x2, y2, right - x2, bottom - y2)
  ];
}

/** The one-pixel row, column or corner of a crop that a strip is stretched from. */
export function glassEdgeSource(edge: GlassEdge, crop: PosterRect): PosterRect {
  const lastX = crop.x + Math.max(0, crop.width - 1);
  const lastY = crop.y + Math.max(0, crop.height - 1);
  switch (edge) {
    case "top":
      return { x: crop.x, y: crop.y, width: crop.width, height: 1 };
    case "bottom":
      return { x: crop.x, y: lastY, width: crop.width, height: 1 };
    case "left":
      return { x: crop.x, y: crop.y, width: 1, height: crop.height };
    case "right":
      return { x: lastX, y: crop.y, width: 1, height: crop.height };
    case "topLeft":
      return { x: crop.x, y: crop.y, width: 1, height: 1 };
    case "topRight":
      return { x: lastX, y: crop.y, width: 1, height: 1 };
    case "bottomLeft":
      return { x: crop.x, y: lastY, width: 1, height: 1 };
    case "bottomRight":
      return { x: lastX, y: lastY, width: 1, height: 1 };
  }
}

/** `#rrggbb` with an alpha, for strokes and tints over the glass layer. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createLayer(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * Blur by drawing the layer into a canvas `factor` times smaller and back
 * again, `passes` times, with high-quality resampling. Cheap, dependency-free
 * and available in every browser; each pass softens roughly in proportion to
 * `factor`.
 */
function pyramidBlur(layer: HTMLCanvasElement, factor: number, passes: number): void {
  if (factor <= 1) return;
  const small = createLayer(layer.width / factor, layer.height / factor);
  const smallContext = small?.getContext("2d");
  const layerContext = layer.getContext("2d");
  if (!small || !smallContext || !layerContext) return;
  smallContext.imageSmoothingEnabled = true;
  smallContext.imageSmoothingQuality = "high";
  layerContext.imageSmoothingEnabled = true;
  layerContext.imageSmoothingQuality = "high";
  for (let pass = 0; pass < passes; pass += 1) {
    smallContext.clearRect(0, 0, small.width, small.height);
    smallContext.drawImage(layer, 0, 0, small.width, small.height);
    layerContext.clearRect(0, 0, layer.width, layer.height);
    layerContext.drawImage(small, 0, 0, layer.width, layer.height);
  }
}

/**
 * Paint the glass background onto `context`. Returns false, having drawn
 * nothing, when it cannot (no document, no usable image), so the caller can
 * fall back to the solid fill.
 */
export function paintGlassBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rectangles: PosterLayoutRect[],
  crops: Map<string, PosterRect>,
  images: Map<string, HTMLImageElement>,
  options: GlassBackgroundOptions
): boolean {
  const scale = GLASS_LAYER_WIDTH / Math.max(1, width);
  const layer = createLayer(GLASS_LAYER_WIDTH, height * scale);
  const layerContext = layer?.getContext("2d");
  if (!layer || !layerContext) return false;

  layerContext.fillStyle = options.colour;
  layerContext.fillRect(0, 0, layer.width, layer.height);
  layerContext.imageSmoothingEnabled = true;
  layerContext.imageSmoothingQuality = "high";
  const bounds: PosterRect = { x: 0, y: 0, width: layer.width, height: layer.height };

  let painted = 0;
  for (const rect of rectangles) {
    const crop = crops.get(rect.id);
    const image = images.get(rect.id);
    if (!crop || !image) continue;
    const dest: PosterRect = {
      x: rect.x * scale,
      y: rect.y * scale,
      width: rect.width * scale,
      height: rect.height * scale
    };
    layerContext.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      dest.x,
      dest.y,
      dest.width,
      dest.height
    );
    for (const strip of glassEdgeStrips(dest, bounds)) {
      if (strip.dest.width < 0.5 || strip.dest.height < 0.5) continue;
      const source = glassEdgeSource(strip.edge, crop);
      layerContext.drawImage(
        image,
        source.x,
        source.y,
        source.width,
        source.height,
        strip.dest.x,
        strip.dest.y,
        strip.dest.width,
        strip.dest.height
      );
    }
    painted += 1;
  }
  if (painted === 0) return false;

  // Half the blur radius in layer pixels per pass, two passes.
  const factor = Math.max(1, (GLASS_LAYER_WIDTH * options.blurPercent) / 100 / 2);
  pyramidBlur(layer, factor, 2);

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(layer, 0, 0, width, height);
  if (options.tintOpacity > 0) {
    context.globalAlpha = options.tintOpacity;
    context.fillStyle = options.colour;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
  return true;
}
