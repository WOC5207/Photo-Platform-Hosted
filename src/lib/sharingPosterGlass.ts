import type { PosterLayoutRect, PosterRect } from "@/lib/sharingPosterLayout";

/**
 * The "liquid glass" poster background: a soft gradient built from the
 * photographs' colours, never from their pixels.
 *
 * Each frame is reduced to colour statistics of what it actually shows: a
 * colour-weighted mean, one mean per side and a coarse grid. Weighting favours
 * vivid colour over neutral grey and mid tones over crushed shadows and blown
 * highlights, so a red costume shapes the palette more than the grey wall
 * behind it. The grid places those colours on the poster to give a four-corner
 * base gradient, and each side's colour flows outward from the frame into the
 * surrounding margin with a Gaussian falloff, so the space beside a frame
 * echoes that side of it without repeating any shape. The result is frosted
 * with the poster's background colour, given a faint specular sheen, soft
 * shadows under the frames and a fine grain that keeps large gradients from
 * banding at export size.
 *
 * The colour work is pure (tested in scripts/test-sharing-posters.ts) and runs
 * on small grids: a 64 px sample per frame, a field about 96 px wide and a
 * shadow layer about 240 px wide. Results are cached by crop and layout, so
 * editing credits or tint repaints without recomputing, and the cost of a
 * full-size export is a handful of scaled draws.
 */

/** OKLab: L in 0..1, a and b roughly -0.4..0.4. */
export type GlassLab = readonly [number, number, number];
export type GlassSide = "top" | "right" | "bottom" | "left";

export interface GlassPalette {
  /** Colour-weighted mean of everything the frame shows. */
  mean: GlassLab;
  /** Colour-weighted mean of the band along each side, eased toward `mean`. */
  edges: Record<GlassSide, GlassLab>;
  /** Row-major cells of L, a, b and total weight, `gridColumns` wide. */
  grid: Float64Array;
  gridColumns: number;
  gridRows: number;
}

export interface GlassFrame {
  rect: PosterRect;
  palette: GlassPalette;
}

export interface GlassField {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export interface GlassShadow {
  width: number;
  height: number;
  alpha: Uint8ClampedArray<ArrayBuffer>;
}

export interface GlassBackgroundOptions {
  /** The poster's background colour, laid over the gradient as frost. */
  colour: string;
  /** The editor's softness control, 0.5..8. */
  blurPercent: number;
  tintOpacity: number;
}

/** Longest side of the sample each frame's crop is reduced to. */
export const GLASS_SAMPLE_EDGE = 64;
/** Cells per side of a palette's placement grid. */
export const GLASS_GRID = 6;
/** Width of the colour field; it is smooth by construction, so this is plenty. */
export const GLASS_FIELD_WIDTH = 96;
/** Width of the shadow layer, finer because shadows are narrow. */
export const GLASS_SHADOW_WIDTH = 240;
export const GLASS_GRAIN_TILE = 64;
export const GLASS_GRAIN_SEED = 0x2545f491;

// Colour weighting.
const VIVID_CHROMA = 0.12;
const NEUTRAL_WEIGHT = 0.25;
const VIVID_WEIGHT = 2;
// Share of each dimension that counts as a side's band.
const EDGE_BAND = 0.12;
// How far a side's colour is eased toward the frame's mean, so a thin border
// in the photograph cannot dictate the whole margin.
const EDGE_TO_MEAN = 0.2;
// How far the corner colours are pushed apart from the overall mean.
const CORNER_SPREAD = 1.3;
// Weight of the base gradient against the colours flowing out of the frames.
const BASE_WEIGHT = 0.6;
const EDGE_STRENGTH = 1.5;
// Chroma ceiling for the finished gradient, so it reads as glass, not neon.
const MAX_CHROMA = 0.16;
// How far each point's lightness is eased toward the poster's mean, so hue
// carries the design and one near-black photograph cannot ink its margin.
const TONE_EASE = 0.35;
const SHADOW_SIGMA_PERCENT = 0.7;
const SHADOW_OFFSET_PERCENT = 0.35;
// Kept light: frames sit a gap apart, and anything stronger fills every gap
// with a dark line.
const SHADOW_ALPHA = 0.08;
const SHEEN_ALPHA = 0.16;
// About 1.5 % either way: several times an 8-bit step, so it dissolves the
// banding of a gradient stretched to export size, yet reads as frost rather
// than speckle at preview size.
const GRAIN_ALPHA = 4;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

let srgbToLinearTable: Float64Array | null = null;

function srgbToLinear(channel: number): number {
  if (!srgbToLinearTable) {
    srgbToLinearTable = new Float64Array(256);
    for (let value = 0; value < 256; value += 1) {
      const c = value / 255;
      srgbToLinearTable[value] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
  }
  return srgbToLinearTable[channel & 255];
}

function linearToSrgb(channel: number): number {
  const c = channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(clamp01(c) * 255);
}

/** sRGB bytes to OKLab. Colours are averaged in OKLab so blends do not go muddy. */
export function srgbToOklab(red: number, green: number, blue: number): [number, number, number] {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

/** OKLab to sRGB bytes, clamped into gamut. */
export function oklabToSrgb(lightness: number, a: number, b: number): [number, number, number] {
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  return [
    linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)
  ];
}

/**
 * How much one pixel counts toward a palette. Vivid colour counts up to eight
 * times neutral grey, and near-black or near-white counts half, easing in
 * smoothly so that a small change in a pixel is a small change in the result:
 * the preview samples the 1280 px rendition and the export the full one, and
 * the two must agree.
 */
export function glassPixelWeight(lightness: number, a: number, b: number): number {
  const vivid = clamp01(Math.hypot(a, b) / VIVID_CHROMA);
  const tone = 0.5 + 0.5 * smoothstep(0.06, 0.2, lightness) * (1 - smoothstep(0.88, 0.98, lightness));
  return (NEUTRAL_WEIGHT + (VIVID_WEIGHT - NEUTRAL_WEIGHT) * vivid) * tone;
}

/** Colour statistics of one frame's sample, or null when nothing in it is opaque. */
export function glassPaletteFromPixels(
  rgba: ArrayLike<number>,
  width: number,
  height: number
): GlassPalette | null {
  const columns = GLASS_GRID;
  const rows = GLASS_GRID;
  const grid = new Float64Array(columns * rows * 4);
  const sides: Record<GlassSide, [number, number, number, number]> = {
    top: [0, 0, 0, 0],
    right: [0, 0, 0, 0],
    bottom: [0, 0, 0, 0],
    left: [0, 0, 0, 0]
  };
  const bandX = Math.max(1, Math.round(width * EDGE_BAND));
  const bandY = Math.max(1, Math.round(height * EDGE_BAND));
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let total = 0;

  const add = (target: number[] | Float64Array, offset: number, L: number, a: number, b: number, w: number) => {
    target[offset] += L * w;
    target[offset + 1] += a * w;
    target[offset + 2] += b * w;
    target[offset + 3] += w;
  };

  for (let y = 0; y < height; y += 1) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = rgba[index + 3] / 255;
      if (alpha <= 0) continue;
      const [L, a, b] = srgbToOklab(rgba[index], rgba[index + 1], rgba[index + 2]);
      const w = glassPixelWeight(L, a, b) * alpha;
      sumL += L * w;
      sumA += a * w;
      sumB += b * w;
      total += w;
      const column = Math.min(columns - 1, Math.floor((x * columns) / width));
      add(grid, (row * columns + column) * 4, L, a, b, w);
      if (y < bandY) add(sides.top, 0, L, a, b, w);
      if (y >= height - bandY) add(sides.bottom, 0, L, a, b, w);
      if (x < bandX) add(sides.left, 0, L, a, b, w);
      if (x >= width - bandX) add(sides.right, 0, L, a, b, w);
    }
  }
  if (total <= 0) return null;

  const mean: GlassLab = [sumL / total, sumA / total, sumB / total];
  const side = (acc: number[]): GlassLab => {
    const own = acc[3] > 0 ? [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]] : mean;
    return [
      own[0] + (mean[0] - own[0]) * EDGE_TO_MEAN,
      own[1] + (mean[1] - own[1]) * EDGE_TO_MEAN,
      own[2] + (mean[2] - own[2]) * EDGE_TO_MEAN
    ];
  };
  for (let cell = 0; cell < columns * rows; cell += 1) {
    const offset = cell * 4;
    const w = grid[offset + 3];
    if (w > 0) {
      grid[offset] /= w;
      grid[offset + 1] /= w;
      grid[offset + 2] /= w;
    } else {
      grid[offset] = mean[0];
      grid[offset + 1] = mean[1];
      grid[offset + 2] = mean[2];
    }
  }
  return {
    mean,
    edges: {
      top: side(sides.top),
      right: side(sides.right),
      bottom: side(sides.bottom),
      left: side(sides.left)
    },
    grid,
    gridColumns: columns,
    gridRows: rows
  };
}

/** The editor's 0.5..8 control as the colour falloff, in percent of poster width. */
export function glassSoftnessPercent(blurPercent: number): number {
  return 5 + 2 * blurPercent;
}

/**
 * The gradient for a poster of `posterWidth` x `posterHeight` with `frames`
 * placed on it, sampled `fieldWidth` cells wide. Pure and deterministic.
 */
export function computeGlassField(
  posterWidth: number,
  posterHeight: number,
  frames: GlassFrame[],
  blurPercent: number,
  fieldWidth = GLASS_FIELD_WIDTH
): GlassField {
  const width = Math.max(1, Math.round(fieldWidth));
  const height = Math.max(1, Math.round((width * posterHeight) / Math.max(1, posterWidth)));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const scale = width / Math.max(1, posterWidth);

  // Corner colours: every grid cell of every frame, placed where it sits on
  // the poster and weighted by colour and by the poster area it covers, votes
  // for the four corners with sharpened bilinear weights.
  const corners = [0, 0, 0, 0].map(() => [0, 0, 0, 0]);
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  let meanW = 0;
  let totalArea = 0;
  for (const { rect, palette } of frames) {
    totalArea += Math.max(0, rect.width * rect.height);
    const cellArea = (rect.width * rect.height) / (palette.gridColumns * palette.gridRows);
    for (let row = 0; row < palette.gridRows; row += 1) {
      for (let column = 0; column < palette.gridColumns; column += 1) {
        const offset = (row * palette.gridColumns + column) * 4;
        const w = palette.grid[offset + 3] * cellArea;
        if (w <= 0) continue;
        const L = palette.grid[offset];
        const a = palette.grid[offset + 1];
        const b = palette.grid[offset + 2];
        const u = clamp01((rect.x + ((column + 0.5) / palette.gridColumns) * rect.width) / posterWidth);
        const v = clamp01((rect.y + ((row + 0.5) / palette.gridRows) * rect.height) / posterHeight);
        const votes = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
        for (let corner = 0; corner < 4; corner += 1) {
          const vote = votes[corner] * votes[corner] * w;
          corners[corner][0] += L * vote;
          corners[corner][1] += a * vote;
          corners[corner][2] += b * vote;
          corners[corner][3] += vote;
        }
        meanL += L * w;
        meanA += a * w;
        meanB += b * w;
        meanW += w;
      }
    }
  }
  const mean: GlassLab = meanW > 0 ? [meanL / meanW, meanA / meanW, meanB / meanW] : [0.85, 0, 0];
  const [tl, tr, bl, br] = corners.map((acc): GlassLab => {
    const own = acc[3] > 0 ? [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]] : mean;
    return [
      mean[0] + (own[0] - mean[0]) * CORNER_SPREAD,
      mean[1] + (own[1] - mean[1]) * CORNER_SPREAD,
      mean[2] + (own[2] - mean[2]) * CORNER_SPREAD
    ];
  });

  const sigma = (glassSoftnessPercent(blurPercent) / 100) * width;
  const falloff = 1 / (2 * sigma * sigma);
  const reach = 9 * sigma * sigma;
  const halo = 0.25 * sigma;
  const placed = frames.map(({ rect, palette }) => {
    const share = totalArea > 0 ? (rect.width * rect.height * frames.length) / totalArea : 1;
    return {
      x1: rect.x * scale,
      y1: rect.y * scale,
      x2: (rect.x + rect.width) * scale,
      y2: (rect.y + rect.height) * scale,
      strength: EDGE_STRENGTH * Math.min(1.4, Math.max(0.7, Math.sqrt(share))),
      edges: palette.edges
    };
  });

  for (let fy = 0; fy < height; fy += 1) {
    const py = fy + 0.5;
    const v = py / height;
    for (let fx = 0; fx < width; fx += 1) {
      const px = fx + 0.5;
      const u = px / width;
      const wTl = (1 - u) * (1 - v);
      const wTr = u * (1 - v);
      const wBl = (1 - u) * v;
      const wBr = u * v;
      let sumL = (tl[0] * wTl + tr[0] * wTr + bl[0] * wBl + br[0] * wBr) * BASE_WEIGHT;
      let sumA = (tl[1] * wTl + tr[1] * wTr + bl[1] * wBl + br[1] * wBr) * BASE_WEIGHT;
      let sumB = (tl[2] * wTl + tr[2] * wTr + bl[2] * wBl + br[2] * wBr) * BASE_WEIGHT;
      let total = BASE_WEIGHT;

      for (const frame of placed) {
        const alongX = px < frame.x1 ? frame.x1 - px : px > frame.x2 ? px - frame.x2 : 0;
        const alongY = py < frame.y1 ? frame.y1 - py : py > frame.y2 ? py - frame.y2 : 0;
        // Each side contributes only on its own outer half-plane, eased in
        // across a narrow halo so neighbouring sides blend around corners.
        const outward: Array<[number, number, GlassLab]> = [
          [frame.y1 - py, alongX, frame.edges.top],
          [py - frame.y2, alongX, frame.edges.bottom],
          [frame.x1 - px, alongY, frame.edges.left],
          [px - frame.x2, alongY, frame.edges.right]
        ];
        for (const [distance, along, colour] of outward) {
          if (distance <= -halo) continue;
          const outside = distance > 0 ? distance : 0;
          const squared = outside * outside + along * along;
          if (squared >= reach) continue;
          const w = frame.strength * Math.exp(-squared * falloff) * smoothstep(-halo, halo, distance);
          sumL += colour[0] * w;
          sumA += colour[1] * w;
          sumB += colour[2] * w;
          total += w;
        }
      }

      const raw = sumL / total;
      const L = raw + (mean[0] - raw) * TONE_EASE;
      let a = sumA / total;
      let b = sumB / total;
      const chroma = Math.hypot(a, b);
      if (chroma > MAX_CHROMA) {
        a *= MAX_CHROMA / chroma;
        b *= MAX_CHROMA / chroma;
      }
      const [red, green, blue] = oklabToSrgb(L, a, b);
      const index = (fy * width + fx) * 4;
      rgba[index] = red;
      rgba[index + 1] = green;
      rgba[index + 2] = blue;
      rgba[index + 3] = 255;
    }
  }
  return { width, height, rgba };
}

/**
 * Soft drop shadows under `rects`, as an alpha mask `fieldWidth` cells wide.
 *
 * Where two frames' shadows overlap the stronger is reduced by the weaker, so
 * a shadow shows where a frame meets open glass and fades out in the narrow
 * gutter between neighbours, which it would otherwise fill with a dark line.
 */
export function computeGlassShadow(
  posterWidth: number,
  posterHeight: number,
  rects: PosterRect[],
  fieldWidth = GLASS_SHADOW_WIDTH
): GlassShadow {
  const width = Math.max(1, Math.round(fieldWidth));
  const height = Math.max(1, Math.round((width * posterHeight) / Math.max(1, posterWidth)));
  const values = new Float32Array(width * height);
  const runnersUp = new Float32Array(width * height);
  const scale = width / Math.max(1, posterWidth);
  const sigma = (SHADOW_SIGMA_PERCENT / 100) * width;
  const offset = (SHADOW_OFFSET_PERCENT / 100) * width;
  const falloff = 1 / (2 * sigma * sigma);
  const reach = 3 * sigma;
  for (const rect of rects) {
    const x1 = rect.x * scale;
    const x2 = (rect.x + rect.width) * scale;
    const y1 = rect.y * scale + offset;
    const y2 = (rect.y + rect.height) * scale + offset;
    const fromY = Math.max(0, Math.floor(y1 - reach));
    const toY = Math.min(height - 1, Math.ceil(y2 + reach));
    const fromX = Math.max(0, Math.floor(x1 - reach));
    const toX = Math.min(width - 1, Math.ceil(x2 + reach));
    for (let fy = fromY; fy <= toY; fy += 1) {
      const py = fy + 0.5;
      const dy = py < y1 ? y1 - py : py > y2 ? py - y2 : 0;
      for (let fx = fromX; fx <= toX; fx += 1) {
        const px = fx + 0.5;
        const dx = px < x1 ? x1 - px : px > x2 ? px - x2 : 0;
        const value = Math.exp(-(dx * dx + dy * dy) * falloff);
        const index = fy * width + fx;
        if (value > values[index]) {
          runnersUp[index] = values[index];
          values[index] = value;
        } else if (value > runnersUp[index]) {
          runnersUp[index] = value;
        }
      }
    }
  }
  const alpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = Math.round((values[index] - runnersUp[index]) * SHADOW_ALPHA * 255);
  }
  return { width, height, alpha };
}

/**
 * A tile of faint black-and-white grain from a fixed seed, so preview and
 * export carry the same pattern. It breaks up the eight-bit steps a smooth
 * gradient shows when stretched across thousands of pixels.
 */
export function glassGrainTile(
  size = GLASS_GRAIN_TILE,
  seed = GLASS_GRAIN_SEED
): Uint8ClampedArray<ArrayBuffer> {
  const tile = new Uint8ClampedArray(size * size * 4);
  let state = seed >>> 0;
  for (let index = 0; index < tile.length; index += 4) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const light = ((t ^ (t >>> 14)) >>> 0) / 4294967296 >= 0.5 ? 255 : 0;
    tile[index] = light;
    tile[index + 1] = light;
    tile[index + 2] = light;
    tile[index + 3] = GRAIN_ALPHA;
  }
  return tile;
}

/** `#rrggbb` with an alpha, for strokes and tints over the glass layer. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Browser side ------------------------------------------------------------

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

let sampler: CanvasRenderingContext2D | null = null;
const PALETTES_PER_IMAGE = 8;
const paletteCache = new WeakMap<HTMLImageElement, Map<string, GlassPalette | null>>();
const paletteIds = new WeakMap<GlassPalette, number>();
let nextPaletteId = 1;

/** The palette of what `image` shows through `crop`, cached per crop. Throws on a tainted image. */
function paletteFor(image: HTMLImageElement, crop: PosterRect): GlassPalette | null {
  const key = `${Math.round(crop.x)}:${Math.round(crop.y)}:${Math.round(crop.width)}:${Math.round(crop.height)}`;
  let byCrop = paletteCache.get(image);
  if (!byCrop) {
    byCrop = new Map();
    paletteCache.set(image, byCrop);
  }
  if (byCrop.has(key)) return byCrop.get(key) ?? null;

  const landscape = crop.width >= crop.height;
  const sampleWidth = landscape
    ? GLASS_SAMPLE_EDGE
    : Math.max(1, Math.round((GLASS_SAMPLE_EDGE * crop.width) / Math.max(1, crop.height)));
  const sampleHeight = landscape
    ? Math.max(1, Math.round((GLASS_SAMPLE_EDGE * crop.height) / Math.max(1, crop.width)))
    : GLASS_SAMPLE_EDGE;
  if (!sampler) {
    sampler = createCanvas(GLASS_SAMPLE_EDGE, GLASS_SAMPLE_EDGE).getContext("2d", {
      willReadFrequently: true
    });
  }
  if (!sampler) return null;
  sampler.clearRect(0, 0, GLASS_SAMPLE_EDGE, GLASS_SAMPLE_EDGE);
  sampler.imageSmoothingEnabled = true;
  sampler.imageSmoothingQuality = "high";
  sampler.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampler.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const palette = glassPaletteFromPixels(pixels, sampleWidth, sampleHeight);
  if (palette) paletteIds.set(palette, nextPaletteId++);

  if (byCrop.size >= PALETTES_PER_IMAGE) {
    const oldest = byCrop.keys().next().value;
    if (oldest !== undefined) byCrop.delete(oldest);
  }
  byCrop.set(key, palette);
  return palette;
}

const LAYERS_KEPT = 4;
const fieldLayers = new Map<string, HTMLCanvasElement>();
const shadowLayers = new Map<string, HTMLCanvasElement>();

function remember(cache: Map<string, HTMLCanvasElement>, key: string, layer: HTMLCanvasElement) {
  if (cache.size >= LAYERS_KEPT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, layer);
}

function geometryKey(width: number, height: number, rect: PosterRect): string {
  return [rect.x / width, rect.y / height, rect.width / width, rect.height / height]
    .map((value) => value.toFixed(4))
    .join(",");
}

function fieldLayer(width: number, height: number, frames: GlassFrame[], blurPercent: number) {
  const key = [
    blurPercent.toFixed(2),
    (height / width).toFixed(4),
    ...frames.map((frame) => `${paletteIds.get(frame.palette)}@${geometryKey(width, height, frame.rect)}`)
  ].join("|");
  const cached = fieldLayers.get(key);
  if (cached) return cached;
  const field = computeGlassField(width, height, frames, blurPercent);
  const raw = createCanvas(field.width, field.height);
  const rawContext = raw.getContext("2d");
  // Upscale once, four times over, so the final stretch to poster size starts
  // from an already smooth image instead of a 96 px grid.
  const smooth = createCanvas(field.width * 4, field.height * 4);
  const smoothContext = smooth.getContext("2d");
  if (!rawContext || !smoothContext) return null;
  rawContext.putImageData(new ImageData(field.rgba, field.width, field.height), 0, 0);
  smoothContext.imageSmoothingEnabled = true;
  smoothContext.imageSmoothingQuality = "high";
  smoothContext.drawImage(raw, 0, 0, smooth.width, smooth.height);
  remember(fieldLayers, key, smooth);
  return smooth;
}

function shadowLayer(width: number, height: number, rects: PosterRect[]) {
  const key = [(height / width).toFixed(4), ...rects.map((rect) => geometryKey(width, height, rect))].join("|");
  const cached = shadowLayers.get(key);
  if (cached) return cached;
  const shadow = computeGlassShadow(width, height, rects);
  const layer = createCanvas(shadow.width, shadow.height);
  const context = layer.getContext("2d");
  if (!context) return null;
  const rgba = new Uint8ClampedArray(shadow.width * shadow.height * 4);
  for (let index = 0; index < shadow.alpha.length; index += 1) rgba[index * 4 + 3] = shadow.alpha[index];
  context.putImageData(new ImageData(rgba, shadow.width, shadow.height), 0, 0);
  remember(shadowLayers, key, layer);
  return layer;
}

let grainLayer: HTMLCanvasElement | null = null;

function grain(): HTMLCanvasElement | null {
  if (grainLayer) return grainLayer;
  const layer = createCanvas(GLASS_GRAIN_TILE, GLASS_GRAIN_TILE);
  const context = layer.getContext("2d");
  if (!context) return null;
  context.putImageData(new ImageData(glassGrainTile(), GLASS_GRAIN_TILE, GLASS_GRAIN_TILE), 0, 0);
  grainLayer = layer;
  return layer;
}

/**
 * Paint the glass background onto `context`. Returns false, having drawn
 * nothing, when it cannot (no document, no readable image), so the caller can
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
  if (typeof document === "undefined") return false;
  const frames: GlassFrame[] = [];
  try {
    for (const rect of rectangles) {
      const crop = crops.get(rect.id);
      const image = images.get(rect.id);
      if (!crop || !image) continue;
      const palette = paletteFor(image, crop);
      if (palette) frames.push({ rect, palette });
    }
  } catch {
    // An image from another origin cannot be read; solid colour still works.
    return false;
  }
  if (frames.length === 0) return false;
  const field = fieldLayer(width, height, frames, options.blurPercent);
  if (!field) return false;

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(field, 0, 0, width, height);
  if (options.tintOpacity > 0) {
    context.globalAlpha = options.tintOpacity;
    context.fillStyle = options.colour;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
  }
  const sheen = context.createLinearGradient(0, 0, width * 0.55, height * 0.45);
  sheen.addColorStop(0, `rgba(255, 255, 255, ${SHEEN_ALPHA})`);
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, width, height);
  const shadow = shadowLayer(width, height, rectangles);
  if (shadow) context.drawImage(shadow, 0, 0, width, height);
  const tile = grain();
  const pattern = tile ? context.createPattern(tile, "repeat") : null;
  if (pattern) {
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
  }
  context.restore();
  return true;
}
