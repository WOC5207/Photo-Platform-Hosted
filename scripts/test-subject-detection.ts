/**
 * Subject detection against synthetic photographs with known geometry: a
 * skin-toned figure on a flat field, in both orientations and at two
 * positions, plus a featureless image. Builds fixtures with sharp from SVG, as
 * scripts/test-cosplan.ts does, and runs the real file-based entry point.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import {
  SUBJECT_DETECTION_VERSION,
  detectSubjectFromFile
} from "../src/lib/subjectDetection";

async function figureFixture(
  root: string,
  name: string,
  width: number,
  height: number,
  centreX: number,
  centreY: number
): Promise<{ file: string; bounds: { x: number; y: number; width: number; height: number } }> {
  const rx = width * 0.1;
  const ry = height * 0.17;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#8a8a8a"/>
    <ellipse cx="${centreX * width}" cy="${centreY * height}" rx="${rx}" ry="${ry}" fill="#e0ac8b" stroke="#3a2a22" stroke-width="6"/>
  </svg>`;
  const file = path.join(root, `${name}-med.webp`);
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(file);
  return {
    file,
    bounds: {
      x: centreX - rx / width,
      y: centreY - ry / height,
      width: (2 * rx) / width,
      height: (2 * ry) / height
    }
  };
}

function intersectionOverUnion(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = w * h;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

async function main() {
  // The detector runs standalone here, so disable sharp's file cache as the
  // application does; otherwise Windows keeps the last fixture open and the
  // cleanup below cannot unlink it.
  sharp.cache(false);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "subject-detection-"));
  try {
  // Landscape, figure low on the left.
  const left = await figureFixture(root, "landscape-left", 1280, 853, 0.25, 0.6);
  const started = performance.now();
  const detected = await detectSubjectFromFile(left.file);
  const elapsed = performance.now() - started;
  assert.equal(detected.version, SUBJECT_DETECTION_VERSION);
  assert.ok(detected.subject, "a clear figure must be detected");
  const subject = detected.subject!;
  assert.ok(subject.x >= 0.17 && subject.x <= 0.33, `point x ${subject.x} should sit on the figure`);
  assert.ok(subject.y >= 0.5 && subject.y <= 0.7, `point y ${subject.y} should sit on the figure`);
  assert.ok(
    subject.x >= subject.box.x && subject.x <= subject.box.x + subject.box.width,
    "the box must contain the point horizontally"
  );
  assert.ok(
    subject.y >= subject.box.y && subject.y <= subject.box.y + subject.box.height,
    "the box must contain the point vertically"
  );
  const iou = intersectionOverUnion(subject.box, left.bounds);
  assert.ok(iou > 0.3, `box should overlap the figure (IoU ${iou.toFixed(2)})`);
  assert.ok(elapsed < 2000, `one detection took ${elapsed.toFixed(0)} ms`);

  // Same figure high on the right: the point must move with it. A wrong
  // coordinate space would leave it stranded by the crop offset.
  const right = await figureFixture(root, "landscape-right", 1280, 853, 0.75, 0.3);
  const mirrored = await detectSubjectFromFile(right.file);
  assert.ok(mirrored.subject, "the mirrored figure must be detected");
  assert.ok(mirrored.subject!.x >= 0.67 && mirrored.subject!.x <= 0.83, `mirrored x ${mirrored.subject!.x}`);
  assert.ok(mirrored.subject!.y >= 0.2 && mirrored.subject!.y <= 0.4, `mirrored y ${mirrored.subject!.y}`);
  assert.ok(intersectionOverUnion(mirrored.subject!.box, right.bounds) > 0.3);

  // Portrait exercises the other smartcrop axis.
  const portrait = await figureFixture(root, "portrait", 853, 1280, 0.5, 0.3);
  const tall = await detectSubjectFromFile(portrait.file);
  assert.ok(tall.subject, "the portrait figure must be detected");
  assert.ok(tall.subject!.x >= 0.4 && tall.subject!.x <= 0.6, `portrait x ${tall.subject!.x}`);
  assert.ok(tall.subject!.y >= 0.2 && tall.subject!.y <= 0.4, `portrait y ${tall.subject!.y}`);

  // A square image: libvips only runs its attention pass when there is
  // something to crop, so this is the case a square-to-square target missed.
  const square = await figureFixture(root, "square", 900, 900, 0.3, 0.65);
  const boxy = await detectSubjectFromFile(square.file);
  assert.ok(boxy.subject, "the square figure must be detected");
  assert.ok(boxy.subject!.x >= 0.2 && boxy.subject!.x <= 0.4, `square x ${boxy.subject!.x}`);
  assert.ok(boxy.subject!.y >= 0.5 && boxy.subject!.y <= 0.8, `square y ${boxy.subject!.y}`);
  assert.ok(intersectionOverUnion(boxy.subject!.box, square.bounds) > 0.3);

  // A featureless image has no subject.
  const flat = path.join(root, "flat-med.webp");
  await sharp({ create: { width: 1280, height: 853, channels: 3, background: "#8a8a8a" } })
    .webp()
    .toFile(flat);
  const nothing = await detectSubjectFromFile(flat);
  assert.equal(nothing.version, SUBJECT_DETECTION_VERSION);
  assert.equal(nothing.subject, null);

  // Deterministic.
  assert.deepEqual(await detectSubjectFromFile(left.file), detected);

  console.log("Subject detection tests passed.");
  } finally {
    assert.ok(root.startsWith(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
