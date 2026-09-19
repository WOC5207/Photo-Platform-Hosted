/**
 * Subject detection against synthetic photographs with known geometry: a
 * skin-toned figure on a flat field, in both orientations and at two
 * positions, full-length cosplay figures with small red accents at the knees
 * and shoes on a sky and building background, plus a featureless image.
 * Builds fixtures with sharp from SVG, as scripts/test-cosplan.ts does, and
 * runs the real file-based entry point.
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

/**
 * A full-length figure like the poster photographs that version 1 got wrong:
 * brown costume (which passes the skin test, as real ones do), white socks,
 * and small red ribbons at the knees and ornaments on the shoes, standing on
 * a white pedestal before sky, window-gridded buildings, a railing and a
 * concrete wall. Version 1's attention point landed on those accents and its
 * box collapsed to a strip at knee height.
 */
async function cosplayFixture(
  root: string,
  name: string,
  width: number,
  height: number,
  centreX: number,
  top: number,
  figureHeight: number
): Promise<{ file: string; bounds: { x: number; y: number; width: number; height: number }; kneeY: number }> {
  // Figure geometry in units of its own height, from the hat's top.
  const u = figureHeight * height;
  const cx = centreX * width;
  const X = (dx: number) => cx + dx * u;
  const Y = (dy: number) => top * height + dy * u;
  const part = (x0: number, y0: number, x1: number, y1: number, fill: string) =>
    `<rect x="${X(x0)}" y="${Y(y0)}" width="${(x1 - x0) * u}" height="${(y1 - y0) * u}" fill="${fill}"/>`;
  const horizon = 0.6 * height;
  const buildings = [
    [0.02, 0.3, 0.16, "#7b8da1"],
    [0.18, 0.22, 0.12, "#5e7084"],
    [0.62, 0.27, 0.14, "#8c9bab"],
    [0.8, 0.34, 0.17, "#6a7c90"]
  ]
    .map(([bx, by, bw, fill]) => {
      const attributes = `x="${Number(bx) * width}" y="${Number(by) * height}" width="${Number(bw) * width}" height="${horizon - Number(by) * height}"`;
      return `<rect ${attributes} fill="${fill}"/><rect ${attributes} fill="url(#windows)"/>`;
    })
    .join("");
  const sleeve = (side: number) =>
    `<polygon points="${X(side * 0.1)},${Y(0.17)} ${X(side * 0.175)},${Y(0.4)} ${X(side * 0.125)},${Y(0.42)} ${X(side * 0.08)},${Y(0.26)}" fill="#6e4b3b"/>` +
    `<ellipse cx="${X(side * 0.15)}" cy="${Y(0.43)}" rx="${0.018 * u}" ry="${0.022 * u}" fill="#f1c9b1"/>`;
  const leg = (side: number) => {
    const inner = side * 0.015;
    const outer = side * 0.065;
    const [left, right] = side < 0 ? [outer, inner] : [inner, outer];
    return (
      part(left, 0.52, right, 0.66, "#f1c9b1") +
      part(left, 0.66, right, 0.905, "#f3f3f5") +
      part(left - 0.005, 0.655, right + 0.005, 0.685, "#e2141e") +
      part(side * 0.08 - 0.005, 0.685, side * 0.08 + 0.005, 0.74, "#f7f7f7") +
      `<ellipse cx="${X(side * 0.045)}" cy="${Y(0.925)}" rx="${0.04 * u}" ry="${0.022 * u}" fill="#4b2b1b"/>` +
      `<circle cx="${X(side * 0.045)}" cy="${Y(0.915)}" r="${0.01 * u}" fill="#e2141e"/>`
    );
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5f9fd8"/><stop offset="1" stop-color="#cfe2f2"/>
      </linearGradient>
      <pattern id="windows" width="${width * 0.012}" height="${height * 0.012}" patternUnits="userSpaceOnUse">
        <rect width="${width * 0.007}" height="${height * 0.006}" fill="#b9c7d4" opacity="0.55"/>
      </pattern>
    </defs>
    <rect width="${width}" height="${horizon}" fill="url(#sky)"/>
    <ellipse cx="${0.2 * width}" cy="${0.08 * height}" rx="${0.14 * width}" ry="${0.025 * height}" fill="#ffffff" opacity="0.7"/>
    <ellipse cx="${0.78 * width}" cy="${0.14 * height}" rx="${0.12 * width}" ry="${0.02 * height}" fill="#ffffff" opacity="0.6"/>
    ${buildings}
    <rect y="${horizon - 0.012 * height}" width="${width}" height="${0.006 * height}" fill="#8e9296"/>
    <rect y="${horizon}" width="${width}" height="${0.26 * height}" fill="#c6c5c0"/>
    <rect y="${horizon}" width="${width}" height="${0.012 * height}" fill="#aeada8"/>
    <rect y="${horizon + 0.26 * height}" width="${width}" height="${height}" fill="#d8d6d1"/>
    <ellipse cx="${cx}" cy="${Y(0.955)}" rx="${0.13 * u}" ry="${0.03 * u}" fill="#f1f1ef" stroke="#a6a6a3" stroke-width="${0.004 * u}"/>
    ${part(-0.11, 0.04, 0.11, 0.56, "#2e1a18")}
    ${sleeve(-1)}${sleeve(1)}
    ${part(-0.1, 0.16, 0.1, 0.47, "#6e4b3b")}
    <path d="M ${X(-0.05)} ${Y(0.24)} q ${0.05 * u} ${0.04 * u} ${0.1 * u} 0 M ${X(-0.06)} ${Y(0.33)} q ${0.06 * u} ${0.05 * u} ${0.12 * u} 0 M ${cx} ${Y(0.2)} L ${cx} ${Y(0.46)}" stroke="#c9a55a" stroke-width="${0.006 * u}" fill="none"/>
    ${part(-0.085, 0.45, 0.085, 0.52, "#3b241c")}
    <ellipse cx="${cx}" cy="${Y(0.105)}" rx="${0.05 * u}" ry="${0.058 * u}" fill="#f1c9b1"/>
    ${part(-0.09, 0, 0.09, 0.06, "#3b2a24")}
    <polygon points="${cx},${Y(0.005)} ${X(0.02)},${Y(0.03)} ${cx},${Y(0.055)} ${X(-0.02)},${Y(0.03)}" fill="#c9a55a"/>
    ${part(-0.04, 0.16, 0.04, 0.185, "#c81e28")}
    ${leg(-1)}${leg(1)}
  </svg>`;
  const file = path.join(root, `${name}-med.webp`);
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(file);
  return {
    file,
    bounds: { x: X(-0.175) / width, y: top, width: (0.35 * u) / width, height: (0.947 * u) / height },
    kneeY: Y(0.66) / height
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

  // Same figure high on the right: the point and box must move with it.
  const right = await figureFixture(root, "landscape-right", 1280, 853, 0.75, 0.3);
  const mirrored = await detectSubjectFromFile(right.file);
  assert.ok(mirrored.subject, "the mirrored figure must be detected");
  assert.ok(mirrored.subject!.x >= 0.67 && mirrored.subject!.x <= 0.83, `mirrored x ${mirrored.subject!.x}`);
  assert.ok(mirrored.subject!.y >= 0.2 && mirrored.subject!.y <= 0.4, `mirrored y ${mirrored.subject!.y}`);
  assert.ok(intersectionOverUnion(mirrored.subject!.box, right.bounds) > 0.3);

  // Portrait exercises the other axis.
  const portrait = await figureFixture(root, "portrait", 853, 1280, 0.5, 0.3);
  const tall = await detectSubjectFromFile(portrait.file);
  assert.ok(tall.subject, "the portrait figure must be detected");
  assert.ok(tall.subject!.x >= 0.4 && tall.subject!.x <= 0.6, `portrait x ${tall.subject!.x}`);
  assert.ok(tall.subject!.y >= 0.2 && tall.subject!.y <= 0.4, `portrait y ${tall.subject!.y}`);

  // A square image, which version 1's libvips attention pass once skipped.
  const square = await figureFixture(root, "square", 900, 900, 0.3, 0.65);
  const boxy = await detectSubjectFromFile(square.file);
  assert.ok(boxy.subject, "the square figure must be detected");
  assert.ok(boxy.subject!.x >= 0.2 && boxy.subject!.x <= 0.4, `square x ${boxy.subject!.x}`);
  assert.ok(boxy.subject!.y >= 0.5 && boxy.subject!.y <= 0.8, `square y ${boxy.subject!.y}`);
  assert.ok(intersectionOverUnion(boxy.subject!.box, square.bounds) > 0.3);

  // Full-length cosplay figures: the box must cover the person, not the red
  // accents at the knees and shoes, and the point must sit on the upper body
  // so a crop that cannot hold the whole box keeps the head.
  const cosplayCases: [string, number, number, number, number, number][] = [
    ["cosplay-portrait", 1280, 1920, 0.5, 0.07, 0.88],
    ["cosplay-portrait-right", 1280, 1920, 0.64, 0.1, 0.84],
    ["cosplay-landscape-left", 1920, 1280, 0.3, 0.05, 0.9]
  ];
  for (const [name, width, height, centreX, top, figureHeight] of cosplayCases) {
    const figure = await cosplayFixture(root, name, width, height, centreX, top, figureHeight);
    const found = await detectSubjectFromFile(figure.file);
    assert.ok(found.subject, `${name}: the figure must be detected`);
    const { box, x, y } = found.subject!;
    const { bounds } = figure;
    const overlap = intersectionOverUnion(box, bounds);
    assert.ok(overlap > 0.4, `${name}: box should cover the figure (IoU ${overlap.toFixed(2)})`);
    assert.ok(
      box.height >= 0.6 * bounds.height,
      `${name}: box height ${box.height.toFixed(2)} is a strip, not the figure (${bounds.height.toFixed(2)})`
    );
    assert.ok(box.y <= bounds.y + 0.1 * bounds.height, `${name}: box top ${box.y.toFixed(2)} misses the head`);
    assert.ok(
      box.y + box.height >= bounds.y + 0.92 * bounds.height,
      `${name}: box bottom ${(box.y + box.height).toFixed(2)} stops above the feet`
    );
    assert.ok(x >= bounds.x && x <= bounds.x + bounds.width, `${name}: point x ${x.toFixed(2)} is off the figure`);
    assert.ok(
      y >= bounds.y && y <= bounds.y + 0.4 * bounds.height && y < figure.kneeY,
      `${name}: point y ${y.toFixed(2)} should be on the upper body, not the knees (${figure.kneeY.toFixed(2)})`
    );
    assert.ok(x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height, `${name}: box must hold the point`);
  }

  // A plain-coloured costume on a quiet backdrop: its saturation falls well
  // short of the skin-dominated threshold, yet the box must not stop at the head.
  const plain = path.join(root, "plain-costume-med.webp");
  await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
      <rect width="1600" height="900" fill="#a5b1a0"/>
      <circle cx="1100" cy="290" r="60" fill="#e0ac8b" stroke="#3a2a22" stroke-width="3"/>
      <rect x="1040" y="355" width="120" height="330" rx="18" fill="#2f6db0"/>
    </svg>`)
  )
    .webp({ quality: 80 })
    .toFile(plain);
  const plainBounds = { x: 1040 / 1600, y: 230 / 900, width: 120 / 1600, height: 455 / 900 };
  const costume = await detectSubjectFromFile(plain);
  assert.ok(costume.subject, "the plain costume must be detected");
  const costumeOverlap = intersectionOverUnion(costume.subject!.box, plainBounds);
  assert.ok(costumeOverlap > 0.4, `box should cover head and costume (IoU ${costumeOverlap.toFixed(2)})`);
  assert.ok(
    costume.subject!.box.y + costume.subject!.box.height >= plainBounds.y + 0.9 * plainBounds.height,
    `box bottom ${(costume.subject!.box.y + costume.subject!.box.height).toFixed(2)} stops at the head`
  );

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
