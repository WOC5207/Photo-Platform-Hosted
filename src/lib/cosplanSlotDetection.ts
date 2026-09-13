import "server-only";

import { Worker } from "node:worker_threads";
import sharp from "sharp";
import { withImageProcessingSlot } from "@/lib/images";
import { cosplanTemplatePath, validCosplanDimensions } from "@/lib/cosplanStorage";
import {
  parseCosplanSlots,
  type CosplanDetectionPreset,
  type CosplanSlotCandidate
} from "@/lib/cosplanTypes";

const PRESETS = {
  strict: { minimum: 240, spread: 15 },
  standard: { minimum: 225, spread: 25 },
  loose: { minimum: 205, spread: 35 }
} as const;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 32;
const WORKER_TIMEOUT_MS = 10_000;
const cache = new Map<string, { expiresAt: number; candidates: CosplanSlotCandidate[] }>();
let activeDetections = 0;
const detectionWaiters: Array<() => void> = [];

export class CosplanDetectionBusyError extends Error {}
export class CosplanDetectionTimeoutError extends Error {}

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function simplifyContour(points) {
  let simplified = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
  while (simplified.length > 96) simplified = simplified.filter((_, index) => index % 2 === 0);
  return simplified;
}

function traceContours(mask, width, minX, minY, maxX, maxY, componentArea) {
  const edges = [];
  const outgoing = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const index = edges.length;
    edges.push({ x1, y1, x2, y2 });
    const key = x1 + ":" + y1;
    const list = outgoing.get(key);
    if (list) list.push(index); else outgoing.set(key, [index]);
  };
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && mask[y * width + x] === 2;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  const used = new Uint8Array(edges.length);
  const direction = (edge) => edge.x2 > edge.x1 ? 0 : edge.y2 > edge.y1 ? 1 : edge.x2 < edge.x1 ? 2 : 3;
  const loops = [];
  for (let start = 0; start < edges.length; start += 1) {
    if (used[start]) continue;
    const first = edges[start];
    const firstKey = first.x1 + ":" + first.y1;
    const points = [];
    let currentIndex = start;
    for (let guard = 0; guard <= edges.length; guard += 1) {
      if (used[currentIndex]) break;
      const current = edges[currentIndex];
      used[currentIndex] = 1;
      points.push({ x: current.x1, y: current.y1 });
      const endKey = current.x2 + ":" + current.y2;
      if (endKey === firstKey) break;
      const currentDirection = direction(current);
      const candidates = (outgoing.get(endKey) || []).filter((index) => !used[index]);
      if (!candidates.length) break;
      candidates.sort((a, b) => {
        const turnA = (direction(edges[a]) - currentDirection + 4) % 4;
        const turnB = (direction(edges[b]) - currentDirection + 4) % 4;
        const rank = (turn) => turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
        return rank(turnA) - rank(turnB);
      });
      currentIndex = candidates[0];
    }
    const simplified = simplifyContour(points);
    if (simplified.length >= 3 && Math.abs(polygonArea(simplified)) >= Math.max(4, componentArea * 0.0005)) loops.push(simplified);
  }
  loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return loops.slice(0, 8);
}

function intersectionOverUnion(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (!intersection) return 0;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

function detect() {
  const { pixels, width, height, minimum, spread, insetX, insetY } = workerData;
  const totalPixels = width * height;
  const sourceMask = new Uint8Array(totalPixels);
  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    const low = Math.min(r, g, b);
    const high = Math.max(r, g, b);
    if (alpha >= 242 && low >= minimum && high - low <= spread) sourceMask[index] = 1;
  }

  const mask = new Uint8Array(totalPixels);
  if (insetX || insetY) {
    const stride = width + 1;
    const integral = new Int32Array(stride * (height + 1));
    for (let y = 0; y < height; y += 1) {
      let row = 0;
      for (let x = 0; x < width; x += 1) {
        row += sourceMask[y * width + x];
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
      }
    }
    const required = (insetX * 2 + 1) * (insetY * 2 + 1);
    for (let y = insetY; y < height - insetY; y += 1) {
      for (let x = insetX; x < width - insetX; x += 1) {
        const left = x - insetX;
        const right = x + insetX + 1;
        const top = y - insetY;
        const bottom = y + insetY + 1;
        const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
        if (sum === required) mask[y * width + x] = 1;
      }
    }
  } else {
    mask.set(sourceMask);
  }

  const queue = new Int32Array(totalPixels);
  const minComponentArea = Math.ceil(totalPixels * 0.01);
  const minWidth = Math.ceil(width * 0.05);
  const minHeight = Math.ceil(height * 0.05);
  const found = [];

  for (let start = 0; start < totalPixels; start += 1) {
    if (mask[start] !== 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    mask[start] = 2;
    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [index - width, index - 1, index + 1, index + width];
      for (let n = 0; n < 4; n += 1) {
        const next = neighbors[n];
        if (next < 0 || next >= totalPixels || mask[next] !== 1) continue;
        if ((n === 1 && x === 0) || (n === 2 && x === width - 1)) continue;
        mask[next] = 2;
        queue[tail++] = next;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (tail >= minComponentArea && boxWidth >= minWidth && boxHeight >= minHeight) {
      const componentShare = tail / totalPixels;
      if (componentShare >= 0.01) {
        const fillRatio = tail / (boxWidth * boxHeight);
        const contours = traceContours(mask, width, minX, minY, maxX, maxY, tail);
        const irregular = fillRatio < 0.985 || contours.length > 1;
        const touchesEdge = minX <= insetX || minY <= insetY || maxX >= width - insetX - 1 || maxY >= height - insetY - 1;
        const reasons = [];
        if (touchesEdge) reasons.push("edge");
        if (irregular) reasons.push("irregular");
        if (componentShare > 0.8) reasons.push("large");
        found.push({
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
          area: tail,
          contours: irregular ? contours : undefined,
          quality: reasons.length ? "review" : "recommended",
          reasons
        });
      }
    }
    for (let index = 0; index < tail; index += 1) mask[queue[index]] = 3;
  }

  found.sort((a, b) => b.area - a.area);
  const deduplicated = [];
  for (const candidate of found) {
    if (!deduplicated.some((saved) => intersectionOverUnion(candidate, saved) > 0.82)) {
      deduplicated.push(candidate);
    }
    if (deduplicated.length >= 12) break;
  }
  parentPort.postMessage(deduplicated);
}

try { detect(); } catch (error) { parentPort.postMessage({ error: String(error) }); }
`;

async function withDetectionSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeDetections >= 1) {
    if (detectionWaiters.length >= 2) throw new CosplanDetectionBusyError("busy");
    await new Promise<void>((resolve) => detectionWaiters.push(resolve));
  }
  activeDetections += 1;
  try {
    return await work();
  } finally {
    activeDetections -= 1;
    detectionWaiters.shift()?.();
  }
}

function runDetectionWorker(
  pixels: Buffer,
  width: number,
  height: number,
  preset: CosplanDetectionPreset,
  insetX: number,
  insetY: number
): Promise<Array<{ x: number; y: number; width: number; height: number; contours?: Array<Array<{ x: number; y: number }>>; quality: "recommended" | "review"; reasons: CosplanSlotCandidate["reasons"] }>> {
  const threshold = PRESETS[preset];
  const transferable = new ArrayBuffer(pixels.byteLength);
  new Uint8Array(transferable).set(pixels);
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { pixels: new Uint8Array(transferable), width, height, insetX, insetY, ...threshold },
      transferList: [transferable]
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new CosplanDetectionTimeoutError("timeout"));
    }, WORKER_TIMEOUT_MS);
    worker.once("message", (value) => {
      clearTimeout(timer);
      void worker.terminate();
      if (value && !Array.isArray(value) && value.error) reject(new Error(value.error));
      else resolve(value);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function pruneCache() {
  const now = Date.now();
  for (const [key, value] of cache) if (value.expiresAt <= now) cache.delete(key);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

export async function detectCosplanSlotCandidates(input: {
  assetToken: string;
  width: number;
  height: number;
  preset: CosplanDetectionPreset;
  inset: number;
}): Promise<CosplanSlotCandidate[]> {
  if (!validCosplanDimensions(input.width, input.height) || !(input.preset in PRESETS)) throw new Error("invalidInput");
  const inset = Math.max(0, Math.min(64, Math.round(input.inset)));
  const source = cosplanTemplatePath(input.assetToken);
  if (!source) throw new Error("invalidAsset");
  const cacheKey = `${input.assetToken}:${input.width}x${input.height}:${input.preset}:${inset}`;
  pruneCache();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return structuredClone(cached.candidates);
  }

  return withDetectionSlot(async () => {
    const queuedCache = cache.get(cacheKey);
    if (queuedCache && queuedCache.expiresAt > Date.now()) {
      cache.delete(cacheKey);
      cache.set(cacheKey, queuedCache);
      return structuredClone(queuedCache.candidates);
    }
    const decoded = await withImageProcessingSlot(() =>
      sharp(source, { failOn: "warning", pages: 1 })
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb")
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    );
    const scaleX = input.width / decoded.info.width;
    const scaleY = input.height / decoded.info.height;
    const detected = await runDetectionWorker(
      decoded.data,
      decoded.info.width,
      decoded.info.height,
      input.preset,
      Math.ceil(inset / scaleX),
      Math.ceil(inset / scaleY)
    );
    const raw = detected.map((candidate, index) => {
      const x = Math.ceil(candidate.x * scaleX);
      const y = Math.ceil(candidate.y * scaleY);
      const right = Math.floor((candidate.x + candidate.width) * scaleX);
      const bottom = Math.floor((candidate.y + candidate.height) * scaleY);
      const width = right - x;
      const height = bottom - y;
      const contours = candidate.contours?.map((contour) => contour.map((point) => ({
        x: Math.max(0, Math.min(1, (point.x * scaleX - x) / width)),
        y: Math.max(0, Math.min(1, (point.y * scaleY - y) / height))
      })));
      return {
        id: `candidate-${index + 1}`,
        x,
        y,
        width,
        height,
        ...(contours?.length ? { shape: { type: "polygon" as const, contours } } : {}),
        quality: candidate.quality,
        reasons: candidate.reasons
      };
    });
    const valid = parseCosplanSlots(
      raw.map((candidate) => ({ ...candidate, nameEn: candidate.id, nameZh: candidate.id })),
      input.width,
      input.height
    );
    const byId = new Map(raw.map((candidate) => [candidate.id, candidate]));
    const candidates = valid
      .map((slot) => byId.get(slot.id))
      .filter((candidate): candidate is CosplanSlotCandidate => Boolean(candidate))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((candidate, index) => ({ ...candidate, id: `candidate-${index + 1}` }));
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, candidates });
    pruneCache();
    return structuredClone(candidates);
  });
}
