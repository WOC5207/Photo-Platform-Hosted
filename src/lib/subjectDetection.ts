import sharp from "sharp";
import { config } from "./config";

/**
 * Where the subject of a photograph is, so a poster can crop around it and
 * choose frame shapes that keep it whole.
 *
 * Two cheap steps, both on a working copy at most 512 px on the long side:
 *
 * 1. The point comes from libvips's "attention" crop strategy, which scores
 *    luminance frequency, colour saturation and skin tones. libvips reports
 *    the attention point in the coordinates of the image it was handed, and
 *    sharp only undoes shrink-on-load, so we hand it a raw buffer whose short
 *    side already equals the target square: no resize happens and the point is
 *    unambiguously in working-buffer pixels. A runtime check that the point
 *    lies inside the crop window guards that assumption permanently.
 * 2. The extent comes from a 96-cell energy grid (edges, saturation, skin):
 *    profiles through the attention cell are grown outward while they stay
 *    energetic, which gives a box the layout solver can test frames against.
 *
 * Pure: no database, no import of images.ts (which imports this file).
 */

export const SUBJECT_DETECTION_VERSION = 1;

export interface SubjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedSubject {
  /** Attention point, fractions of the image. */
  x: number;
  y: number;
  /** Approximate extent, fractions of the image; always contains the point. */
  box: SubjectBox;
}

export interface SubjectDetectionResult {
  version: number;
  subject: DetectedSubject | null;
}

const WORKING_EDGE = 512;
const GRID_EDGE = 96;
/** Below this peak energy the image is treated as flat: nothing to find. */
const MIN_PEAK = 0.08;
/** The peak must stand out from the average this much to count as a subject. */
const MIN_PEAK_RATIO = 1.6;
const MIN_EXTENT = 0.12;
const MAX_EXTENT = 0.9;
const FALLBACK_HALF_EXTENT = 0.15;

let warnedAboutCoordinates = false;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function photoNeedsSubject(row: { subjectVersion: number | null }): boolean {
  return row.subjectVersion === null || row.subjectVersion < SUBJECT_DETECTION_VERSION;
}

export async function detectSubjectFromFile(medPath: string): Promise<SubjectDetectionResult> {
  const working = await sharp(medPath, {
    failOn: "warning",
    pages: 1,
    limitInputPixels: config.imageMaxPixels()
  })
    .resize({ width: WORKING_EDGE, height: WORKING_EDGE, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectSubjectFromRaw(working.data, working.info.width, working.info.height, working.info.channels);
}

/** Exposed for tests that build fixtures in memory. */
export async function detectSubjectFromRaw(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<SubjectDetectionResult> {
  const version = SUBJECT_DETECTION_VERSION;
  if (channels !== 3 || width < 2 || height < 2) return { version, subject: null };
  const point = await attentionPoint(data, width, height);
  const grid = await sharp(data, { raw: { width, height, channels: 3 } })
    .resize({ width: GRID_EDGE, height: GRID_EDGE, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const box = subjectBoxFromGrid(grid.data, grid.info.width, grid.info.height, point);
  if (!box) return { version, subject: null };
  return { version, subject: { x: point.x, y: point.y, box } };
}

async function attentionPoint(
  data: Buffer,
  width: number,
  height: number
): Promise<{ x: number; y: number }> {
  const side = Math.min(width, height);
  // The target must be strictly smaller than the image on one axis, or
  // libvips has nothing to crop and never runs the attention pass at all (a
  // square image would otherwise report no point). Keeping the other axis
  // equal to the image's short side means the cover scale is exactly 1, so no
  // resize happens and the coordinates stay in working-buffer pixels.
  const targetWidth = side;
  const targetHeight = width === height ? Math.round(side * 0.9) : side;
  const { info } = await sharp(data, { raw: { width, height, channels: 3 } })
    .resize({ width: targetWidth, height: targetHeight, fit: "cover", position: sharp.strategy.attention })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // libvips reports the extracted region's origin as an offset back to the
  // source, so its sign is not something to depend on.
  const left = Math.abs(info.cropOffsetLeft ?? 0);
  const top = Math.abs(info.cropOffsetTop ?? 0);
  let x = typeof info.attentionX === "number" ? info.attentionX : Number.NaN;
  let y = typeof info.attentionY === "number" ? info.attentionY : Number.NaN;
  const inside =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= left &&
    x <= left + targetWidth &&
    y >= top &&
    y <= top + targetHeight;
  if (!inside) {
    if (!warnedAboutCoordinates) {
      warnedAboutCoordinates = true;
      console.warn(
        "Subject detection: attention point fell outside its crop window; using the window centre. " +
          `point=${String(x)},${String(y)} window=${left},${top} ${targetWidth}x${targetHeight} image=${width}x${height}`
      );
    }
    x = left + targetWidth / 2;
    y = top + targetHeight / 2;
  }
  return { x: clamp01((x + 0.5) / width), y: clamp01((y + 0.5) / height) };
}

/**
 * Per-cell energy: edge strength, colour saturation and a skin-tone test in
 * YCbCr. Weighted so a face or a costume beats a busy background.
 */
function energyGrid(data: Buffer, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  const sat = new Float32Array(width * height);
  const skin = new Float32Array(width * height);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 3) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    sat[i] = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    skin[i] = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 ? 1 : 0;
  }
  const energy = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const left = luma[y * width + Math.max(0, x - 1)];
      const right = luma[y * width + Math.min(width - 1, x + 1)];
      const up = luma[Math.max(0, y - 1) * width + x];
      const down = luma[Math.min(height - 1, y + 1) * width + x];
      const edge = (Math.abs(right - left) + Math.abs(down - up)) / 510;
      energy[i] = 0.5 * edge + 0.3 * sat[i] + 0.6 * skin[i];
    }
  }
  // 3x3 box blur so a single noisy cell cannot steer the box.
  const blurred = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += energy[ny * width + nx];
          count += 1;
        }
      }
      blurred[y * width + x] = sum / count;
    }
  }
  return blurred;
}

function smooth(values: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let d = -radius; d <= radius; d += 1) {
      const j = i + d;
      if (j < 0 || j >= values.length) continue;
      sum += values[j];
      count += 1;
    }
    out[i] = sum / count;
  }
  return out;
}

/** Grow from `origin` while the profile stays energetic; returns [start, end]. */
function grow(profile: Float32Array, origin: number, threshold: number): [number, number] {
  let start = origin;
  let end = origin;
  while (start - 1 >= 0 && profile[start - 1] >= threshold) start -= 1;
  while (end + 1 < profile.length && profile[end + 1] >= threshold) end += 1;
  return [start, end];
}

/** Keep a span inside [0,1], between the extent limits, and containing `point`. */
function fitSpan(start: number, end: number, point: number, min: number, max: number): [number, number] {
  let a = Math.min(start, point);
  let b = Math.max(end, point);
  let size = b - a;
  if (size < min) {
    const half = min / 2;
    a = point - half;
    b = point + half;
  } else if (size > max) {
    const half = max / 2;
    a = Math.max(a, point - half);
    b = Math.min(b, point + half);
    if (b - a < max) {
      a = Math.max(0, Math.min(a, b - max));
      b = a + max;
    }
  }
  if (a < 0) {
    b -= a;
    a = 0;
  }
  if (b > 1) {
    a -= b - 1;
    b = 1;
  }
  a = Math.max(0, a);
  size = b - a;
  return [a, a + size];
}

export function subjectBoxFromGrid(
  data: Buffer,
  width: number,
  height: number,
  point: { x: number; y: number }
): SubjectBox | null {
  if (width < 2 || height < 2) return null;
  const energy = energyGrid(data, width, height);
  let peak = 0;
  let total = 0;
  for (let i = 0; i < energy.length; i += 1) {
    if (energy[i] > peak) peak = energy[i];
    total += energy[i];
  }
  const mean = total / energy.length;
  if (peak < MIN_PEAK || mean <= 0 || peak / mean < MIN_PEAK_RATIO) return null;

  const ax = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const ay = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const bandY = Math.max(1, Math.round(height / 4));
  const bandX = Math.max(1, Math.round(width / 4));

  const columns = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let y = Math.max(0, ay - bandY); y <= Math.min(height - 1, ay + bandY); y += 1) {
      sum += energy[y * width + x];
      count += 1;
    }
    columns[x] = sum / count;
  }
  const rows = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let count = 0;
    for (let x = Math.max(0, ax - bandX); x <= Math.min(width - 1, ax + bandX); x += 1) {
      sum += energy[y * width + x];
      count += 1;
    }
    rows[y] = sum / count;
  }
  const smoothColumns = smooth(columns, 2);
  const smoothRows = smooth(rows, 2);
  const meanColumns = smoothColumns.reduce((sum, value) => sum + value, 0) / width;
  const meanRows = smoothRows.reduce((sum, value) => sum + value, 0) / height;

  const [left, right] = grow(smoothColumns, ax, Math.max(0.3 * smoothColumns[ax], 1.1 * meanColumns));
  const [top, bottom] = grow(smoothRows, ay, Math.max(0.3 * smoothRows[ay], 1.1 * meanRows));

  const grewX = right - left > 0;
  const grewY = bottom - top > 0;
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (!grewX && !grewY) {
    x0 = point.x - FALLBACK_HALF_EXTENT;
    x1 = point.x + FALLBACK_HALF_EXTENT;
    y0 = point.y - FALLBACK_HALF_EXTENT;
    y1 = point.y + FALLBACK_HALF_EXTENT;
  } else {
    x0 = (left - 1) / width;
    x1 = (right + 2) / width;
    y0 = (top - 1) / height;
    y1 = (bottom + 2) / height;
  }
  const [bx0, bx1] = fitSpan(x0, x1, point.x, MIN_EXTENT, MAX_EXTENT);
  const [by0, by1] = fitSpan(y0, y1, point.y, MIN_EXTENT, MAX_EXTENT);
  return { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 };
}
