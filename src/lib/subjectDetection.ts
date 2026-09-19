import sharp from "sharp";
import { config } from "./config";

/**
 * Where the subject of a photograph is, so a poster can crop around it and
 * choose frame shapes that keep it whole.
 *
 * Everything runs on a 96-cell energy grid (edges, saturation, skin) taken
 * from a working copy at most 512 px on the long side:
 *
 * 1. Cells above an Otsu threshold are figure candidates, extended through
 *    weaker neighbours when the background is quiet. An opening drops strands
 *    a cell or two thick (spears, railings, lamp posts), a closing rejoins
 *    pieces of one figure, and the heaviest connected region is the subject,
 *    together with any heavy pieces right beside it.
 * 2. Plain shins carry almost no energy, so a standing figure's shoes show up
 *    as separate blobs below its knees. Pieces directly underneath, within a
 *    lower leg's reach, join the subject too.
 * 3. The box is the subject's bounds. The point is the energy centroid of its
 *    top rows, which on a standing figure is the upper chest, so a crop too
 *    small for the whole box still keeps the head.
 *
 * Version 1 took the point from libvips's attention strategy and grew the box
 * outward from it. On full-length portraits that strategy is dominated by its
 * luminance Laplacian at 32x32 cells, so it picked white socks against dark
 * shoes, knee ribbons or a bright floor corner, and growth from there stopped
 * at once, leaving a strip at knee height.
 *
 * Pure: no database, no import of images.ts (which imports this file).
 */

export const SUBJECT_DETECTION_VERSION = 2;

export interface SubjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedSubject {
  /** Where a crop that cannot hold the whole box centres, fractions of the image. */
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
const THRESHOLD_BINS = 64;
/**
 * Hysteresis: weaker cells connected to the figure join it when they clear
 * this multiple of the median cell (the background, in most photographs) and
 * this share of the threshold. A plain-coloured costume on a quiet backdrop
 * falls well short of the skin-dominated threshold but far above the backdrop;
 * on a busy outdoor background the multiple exceeds the threshold and nothing
 * changes.
 */
const QUIET_BACKGROUND_RATIO = 5;
const LOW_THRESHOLD_SHARE = 0.3;
/** Pieces this close (share of the grid) and heavy (share of the subject's mass) join it. */
const NEAR_GAP = 0.06;
const NEAR_MASS = 0.08;
/**
 * Feet: a piece joins when it starts within FOOT_GAP of the subject's height
 * below the lowest part so far, ends within FOOT_REACH of that height below
 * the body, and lies mostly inside the body's span widened by FOOT_SPREAD of
 * its width. A standing figure's shin is about 0.4 of its head-to-knee height.
 */
const FOOT_GAP = 0.35;
const FOOT_REACH = 0.6;
const FOOT_SPREAD = 0.15;
const FOOT_MASS = 0.005;
/** The point is the energy centroid of this top share of the subject's rows. */
const HEAD_BAND = 0.4;

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
  const grid = await sharp(data, { raw: { width, height, channels: 3 } })
    .resize({ width: GRID_EDGE, height: GRID_EDGE, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { version, subject: subjectFromGrid(grid.data, grid.info.width, grid.info.height) };
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

/**
 * Otsu's threshold over the energy histogram: the level that best separates
 * figure from background, however busy the photograph is overall.
 */
function otsuThreshold(energy: Float32Array, peak: number): number {
  const histogram = new Float64Array(THRESHOLD_BINS);
  for (let i = 0; i < energy.length; i += 1) {
    histogram[Math.min(THRESHOLD_BINS - 1, Math.floor((energy[i] / peak) * THRESHOLD_BINS))] += 1;
  }
  let weighted = 0;
  for (let bin = 0; bin < THRESHOLD_BINS; bin += 1) weighted += bin * histogram[bin];
  let below = 0;
  let belowWeighted = 0;
  let bestSpread = -1;
  let bestBin = 0;
  for (let bin = 0; bin < THRESHOLD_BINS - 1; bin += 1) {
    below += histogram[bin];
    belowWeighted += bin * histogram[bin];
    const above = energy.length - below;
    if (below === 0 || above === 0) continue;
    const gap = belowWeighted / below - (weighted - belowWeighted) / above;
    const spread = below * above * gap * gap;
    if (spread > bestSpread) {
      bestSpread = spread;
      bestBin = bin;
    }
  }
  return ((bestBin + 1) / THRESHOLD_BINS) * peak;
}

function median(values: Float32Array): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[sorted.length >> 1];
}

/** Cells at or above `high`, plus cells at or above `low` connected to them. */
function hysteresis(energy: Float32Array, width: number, height: number, high: number, low: number): Uint8Array {
  const mask = new Uint8Array(energy.length);
  const stack: number[] = [];
  for (let i = 0; i < energy.length; i += 1) {
    if (energy[i] < high) continue;
    mask[i] = 1;
    stack.push(i);
  }
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const x = cell % width;
    const y = (cell - x) / width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] || energy[next] < low) continue;
        mask[next] = 1;
        stack.push(next);
      }
    }
  }
  return mask;
}

/**
 * One 3x3 dilation or erosion, as two 1D passes. Outside the frame counts as
 * set when eroding, so a figure cut off by the frame keeps its edge.
 */
function morph(mask: Uint8Array, width: number, height: number, dilate: boolean): Uint8Array {
  const outside = dilate ? 0 : 1;
  const pass = (source: Uint8Array, horizontal: boolean): Uint8Array => {
    const out = new Uint8Array(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let any = 0;
        let all = 1;
        for (let d = -1; d <= 1; d += 1) {
          const nx = horizontal ? x + d : x;
          const ny = horizontal ? y : y + d;
          const value = nx < 0 || ny < 0 || nx >= width || ny >= height ? outside : source[ny * width + nx];
          any |= value;
          all &= value;
        }
        out[y * width + x] = dilate ? any : all;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

interface Region {
  mass: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 8-connected regions of the mask; each cell's region index goes into `labels`. */
function findRegions(
  mask: Uint8Array,
  energy: Float32Array,
  width: number,
  height: number,
  labels: Int32Array
): Region[] {
  labels.fill(-1);
  const regions: Region[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || labels[seed] >= 0) continue;
    const label = regions.length;
    const region: Region = { mass: 0, x0: width, y0: height, x1: -1, y1: -1 };
    labels[seed] = label;
    stack.push(seed);
    while (stack.length > 0) {
      const cell = stack.pop()!;
      const x = cell % width;
      const y = (cell - x) / width;
      region.mass += energy[cell];
      region.x0 = Math.min(region.x0, x);
      region.y0 = Math.min(region.y0, y);
      region.x1 = Math.max(region.x1, x);
      region.y1 = Math.max(region.y1, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && labels[next] < 0) {
            labels[next] = label;
            stack.push(next);
          }
        }
      }
    }
    regions.push(region);
  }
  return regions;
}

/**
 * Size a span between the extent limits about its own middle, then slide it
 * to hold `point` and stay inside [0,1].
 */
function fitSpan(start: number, end: number, point: number, min: number, max: number): [number, number] {
  const size = Math.min(max, Math.max(min, end - start));
  let a = (start + end) / 2 - size / 2;
  let b = a + size;
  if (point < a) {
    b -= a - point;
    a = point;
  } else if (point > b) {
    a += point - b;
    b = point;
  }
  if (a < 0) {
    b -= a;
    a = 0;
  }
  if (b > 1) {
    a -= b - 1;
    b = 1;
  }
  return [Math.max(0, a), Math.min(1, b)];
}

/** Exposed for tests; `data` is an RGB grid at most GRID_EDGE on its long side. */
export function subjectFromGrid(data: Buffer, width: number, height: number): DetectedSubject | null {
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

  const threshold = otsuThreshold(energy, peak);
  const low = Math.min(
    threshold,
    Math.max(QUIET_BACKGROUND_RATIO * median(energy), LOW_THRESHOLD_SHARE * threshold)
  );
  let mask = hysteresis(energy, width, height, threshold, low);
  // Opening, then closing.
  mask = morph(morph(mask, width, height, false), width, height, true);
  mask = morph(morph(mask, width, height, true), width, height, false);
  const labels = new Int32Array(energy.length);
  const regions = findRegions(mask, energy, width, height, labels);
  if (regions.length === 0) return null;

  let heaviest = 0;
  for (let k = 1; k < regions.length; k += 1) {
    if (regions[k].mass > regions[heaviest].mass) heaviest = k;
  }
  const heaviestMass = regions[heaviest].mass;
  const taken = new Uint8Array(regions.length);
  const subject = { ...regions[heaviest] };
  const take = (k: number) => {
    const region = regions[k];
    taken[k] = 1;
    subject.x0 = Math.min(subject.x0, region.x0);
    subject.y0 = Math.min(subject.y0, region.y0);
    subject.x1 = Math.max(subject.x1, region.x1);
    subject.y1 = Math.max(subject.y1, region.y1);
  };
  take(heaviest);

  // Heavy pieces right beside it: a hand the opening cut off, a second person.
  const gapX = Math.round(NEAR_GAP * width);
  const gapY = Math.round(NEAR_GAP * height);
  for (let grew = true; grew; ) {
    grew = false;
    for (let k = 0; k < regions.length; k += 1) {
      const region = regions[k];
      if (taken[k] || region.mass < NEAR_MASS * heaviestMass) continue;
      if (
        region.x0 > subject.x1 + gapX ||
        region.x1 < subject.x0 - gapX ||
        region.y0 > subject.y1 + gapY ||
        region.y1 < subject.y0 - gapY
      ) {
        continue;
      }
      take(k);
      grew = true;
    }
  }

  // Feet, nearest first, each measured from the lowest part taken so far.
  const bodyBottom = subject.y1;
  const bodyHeight = subject.y1 - subject.y0 + 1;
  const spread = Math.round(FOOT_SPREAD * (subject.x1 - subject.x0 + 1));
  const bodyLeft = subject.x0 - spread;
  const bodyRight = subject.x1 + spread;
  const below = regions
    .map((_, k) => k)
    .filter((k) => !taken[k] && regions[k].y0 > bodyBottom && regions[k].mass >= FOOT_MASS * heaviestMass)
    .sort((a, b) => regions[a].y0 - regions[b].y0);
  for (const k of below) {
    const region = regions[k];
    if (region.y0 - subject.y1 > FOOT_GAP * bodyHeight) break;
    if (region.y1 - bodyBottom > FOOT_REACH * bodyHeight) continue;
    const inside = Math.min(region.x1, bodyRight) - Math.max(region.x0, bodyLeft) + 1;
    if (inside * 2 < region.x1 - region.x0 + 1) continue;
    take(k);
  }

  // The point: energy centroid of the subject's top rows.
  const bandEnd = subject.y0 + Math.ceil(HEAD_BAND * (subject.y1 - subject.y0 + 1));
  let sumX = 0;
  let sumY = 0;
  let sumMass = 0;
  for (let y = subject.y0; y < bandEnd; y += 1) {
    for (let x = subject.x0; x <= subject.x1; x += 1) {
      const cell = y * width + x;
      if (labels[cell] < 0 || !taken[labels[cell]]) continue;
      sumX += (x + 0.5) * energy[cell];
      sumY += (y + 0.5) * energy[cell];
      sumMass += energy[cell];
    }
  }
  const point =
    sumMass > 0
      ? { x: sumX / sumMass / width, y: sumY / sumMass / height }
      : { x: (subject.x0 + subject.x1 + 1) / 2 / width, y: (subject.y0 + bandEnd) / 2 / height };

  const [x0, x1] = fitSpan(subject.x0 / width, (subject.x1 + 1) / width, point.x, MIN_EXTENT, MAX_EXTENT);
  const [y0, y1] = fitSpan(subject.y0 / height, (subject.y1 + 1) / height, point.y, MIN_EXTENT, MAX_EXTENT);
  return { x: point.x, y: point.y, box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
}
