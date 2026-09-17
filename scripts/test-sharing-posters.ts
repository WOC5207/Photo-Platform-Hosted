import assert from "node:assert/strict";
import {
  SHARING_POSTER_MAX_EDGE,
  SHARING_POSTER_MAX_PIXELS,
  defaultSharingPosterComposition,
  legacyTextGapPercent,
  parseSharingPosterComposition,
  sharingPosterCompositionSchema,
  sharingPosterPixelSize
} from "../src/lib/sharingPoster";
import { sharingPosterFooterGeometry } from "../src/lib/sharingPosterCanvas";
import {
  GLASS_FIELD_WIDTH,
  computeGlassField,
  computeGlassShadow,
  glassGrainTile,
  glassPaletteFromPixels,
  glassPixelWeight,
  oklabToSrgb,
  srgbToOklab,
  type GlassPalette
} from "../src/lib/sharingPosterGlass";
import {
  calculateSharingPosterLayout,
  coverCropFromAnchor,
  coverCropSource,
  cropRectToAnchor,
  legacyFocalToAnchor,
  resolvePosterCrop
} from "../src/lib/sharingPosterLayout";

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

for (let count = 1; count <= 9; count += 1) {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    width: index % 2 ? 3000 : 2000,
    height: index % 2 ? 2000 : 3000,
    weight: (index % 5) + 1
  }));
  const area = { x: 20, y: 30, width: 960, height: 1140 };
  const first = calculateSharingPosterLayout(items, area, 8);
  const second = calculateSharingPosterLayout(items, area, 8);
  assert.deepEqual(first, second, `layout with ${count} photos must be deterministic`);
  assert.equal(first.length, count);
  first.forEach((rect) => {
    assert(rect.x >= area.x && rect.y >= area.y);
    assert(rect.x + rect.width <= area.x + area.width + 0.001);
    assert(rect.y + rect.height <= area.y + area.height + 0.001);
    assert(rect.width > 0 && rect.height > 0);
  });
  for (let a = 0; a < first.length; a += 1) {
    for (let b = a + 1; b < first.length; b += 1) {
      assert(!overlaps(first[a], first[b]), `rectangles ${a}/${b} overlap`);
    }
  }
}

const weighted = calculateSharingPosterLayout(
  [
    { id: "low", width: 1000, height: 1000, weight: 1 },
    { id: "high", width: 1000, height: 1000, weight: 5 }
  ],
  { x: 0, y: 0, width: 1000, height: 1000 },
  0
);
assert(weighted[1].width * weighted[1].height > weighted[0].width * weighted[0].height);

const cropLeft = coverCropSource(2000, 1000, 500, 500, 0, 0.5);
const cropRight = coverCropSource(2000, 1000, 500, 500, 1, 0.5);
assert.equal(cropLeft.x, 0);
assert.equal(cropRight.x, 1000);

const composition = defaultSharingPosterComposition("en", "Photographer");

// A chosen size is delivered exactly, at the squarest ratio as much as at the
// widest. An area ceiling below the square case would silently shrink both,
// which is what made the old 4096 option smaller than it claimed.
assert.equal(SHARING_POSTER_MAX_PIXELS, SHARING_POSTER_MAX_EDGE * SHARING_POSTER_MAX_EDGE);
for (const edge of [2160, 4096, SHARING_POSTER_MAX_EDGE]) {
  composition.export.longestEdge = edge;
  composition.ratio = { width: 1, height: 1 };
  assert.deepEqual(sharingPosterPixelSize(composition), { width: edge, height: edge });
  composition.ratio = { width: 4, height: 5 };
  assert.deepEqual(sharingPosterPixelSize(composition), {
    width: Math.round((edge * 4) / 5),
    height: edge
  });
  composition.ratio = { width: 16, height: 9 };
  assert.deepEqual(sharingPosterPixelSize(composition), {
    width: edge,
    height: Math.round((edge * 9) / 16)
  });
}

// The schema admits the new maximum and nothing beyond it.
composition.export.longestEdge = SHARING_POSTER_MAX_EDGE;
composition.ratio = { width: 1, height: 1 };
assert.equal(sharingPosterCompositionSchema.safeParse(composition).success, true);
assert.equal(
  sharingPosterCompositionSchema.safeParse({
    ...composition,
    export: { ...composition.export, longestEdge: SHARING_POSTER_MAX_EDGE + 1 }
  }).success,
  false
);
assert.equal(
  sharingPosterCompositionSchema.safeParse({
    ...composition,
    export: { ...composition.export, longestEdge: 719 }
  }).success,
  false
);

// A poster saved before the ceiling moved keeps its stored choice and simply
// renders it in full, since the layout is proportional to the width.
const savedAt4096 = parseSharingPosterComposition(
  { ...composition, export: { format: "jpeg", longestEdge: 4096 } },
  defaultSharingPosterComposition("en", "Photographer")
);
assert.equal(savedAt4096.export.longestEdge, 4096);

composition.export.longestEdge = 4096;
assert.equal(sharingPosterCompositionSchema.safeParse({
  ...composition,
  photos: [
    { photoId: "same", weight: 3, focalX: 0.5, focalY: 0.5 },
    { photoId: "same", weight: 3, focalX: 0.5, focalY: 0.5 }
  ]
}).success, false);

// --- Text gap ---------------------------------------------------------------

// A poster without `textGapPercent` must keep the spacing it was saved with:
// the footer padding derived from margin and font size, the gap being that
// padding plus the margin. Includes the 11 px font floor (width 300).
for (const [width, height, marginPercent, footerTextPercent, lineCount] of [
  [1728, 2160, 2.5, 1.8, 3],
  [300, 400, 0, 1, 2],
  [900, 1600, 12, 4, 6],
  [1080, 1920, 2.5, 1.8, 0]
] as const) {
  const geometry = sharingPosterFooterGeometry({ width, height, lineCount, marginPercent, footerTextPercent });
  const margin = (width * marginPercent) / 100;
  const fontSize = Math.max(11, (width * footerTextPercent) / 100);
  const lineHeight = fontSize * 1.38;
  const footerPadding = Math.max(margin * 0.8, fontSize * 0.8);
  const footerHeight = lineCount * lineHeight + footerPadding * 2;
  const photoHeight = height - footerHeight - margin * 2;
  assert.equal(geometry.margin, margin);
  assert.equal(geometry.fontSize, fontSize);
  assert.equal(geometry.lineHeight, lineHeight);
  assert.deepEqual(geometry.photoArea, { x: margin, y: margin, width: Math.max(1, width - margin * 2), height: Math.max(1, photoHeight) });
  assert.equal(geometry.textY, height - footerHeight + footerPadding);
  assert.equal(geometry.footerTooTall, photoHeight < Math.max(height * 0.22, fontSize * 4));
}

// With the field present the gap is exactly what was asked for, down to zero,
// and the footer's bottom inset equals the outer margin.
for (const textGapPercent of [0, 0.7, 2.5, 8]) {
  const width = 1728;
  const height = 2160;
  const lineCount = 3;
  const geometry = sharingPosterFooterGeometry({ width, height, lineCount, marginPercent: 2.5, footerTextPercent: 1.8, textGapPercent });
  const gap = (width * textGapPercent) / 100;
  assert.ok(Math.abs(geometry.textY - (geometry.photoArea.y + geometry.photoArea.height) - gap) < 1e-9, `gap ${textGapPercent}%`);
  const bottomInset = height - (geometry.textY + lineCount * geometry.lineHeight);
  assert.ok(Math.abs(bottomInset - geometry.margin) < 1e-9, "bottom inset equals the margin");
}
assert.equal(legacyTextGapPercent({ marginPercent: 2.5, footerTextPercent: 1.8 }), 4.5);

// --- Backward compatibility of the composition schema -----------------------

// A composition shaped exactly like one saved before these fields existed
// must still parse, and must not be replaced by the fallback.
const legacyShaped = JSON.parse(JSON.stringify(composition)) as Record<string, unknown> & { style: Record<string, unknown> };
delete legacyShaped.style.textGapPercent;
delete legacyShaped.style.background;
assert.equal(sharingPosterCompositionSchema.safeParse(legacyShaped).success, true);
const fallback = defaultSharingPosterComposition("zh", "Fallback");
const parsedLegacy = parseSharingPosterComposition(legacyShaped, fallback);
assert.notEqual(parsedLegacy, fallback);
assert.equal(parsedLegacy.style.textGapPercent, undefined);
assert.equal(parsedLegacy.style.background, undefined);

const withGlass = (background: unknown) => sharingPosterCompositionSchema.safeParse({ ...composition, style: { ...composition.style, background } }).success;
assert.equal(withGlass({ mode: "solid" }), true);
assert.equal(withGlass({ mode: "glass", blurPercent: 3, tintOpacity: 0.55 }), true);
assert.equal(withGlass({ mode: "glass" }), false, "glass needs both numbers");
assert.equal(withGlass({ mode: "glass", blurPercent: 3, tintOpacity: 1 }), false, "tint is capped below opaque");
assert.equal(withGlass({ mode: "frosted" }), false);

// --- Glass background ----------------------------------------------------------

type Rgb = [number, number, number];

function fill(width: number, height: number, paint: (x: number, y: number) => Rgb, alpha = 255) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = alpha;
    }
  }
  return rgba;
}

function labDistance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function fieldLab(field: { width: number; rgba: Uint8ClampedArray }, posterWidth: number, x: number, y: number) {
  const scale = field.width / posterWidth;
  const fx = Math.min(field.width - 1, Math.floor(x * scale));
  const fy = Math.floor(y * scale);
  const i = (fy * field.width + fx) * 4;
  return srgbToOklab(field.rgba[i], field.rgba[i + 1], field.rgba[i + 2]);
}

const RED: Rgb = [215, 38, 61];
const BLUE: Rgb = [27, 111, 209];
const GREY: Rgb = [128, 128, 128];
const ORANGE: Rgb = [255, 140, 26];

// OKLab round-trips every byte colour it is asked about, and anchors black and white.
for (const colour of [RED, BLUE, GREY, ORANGE, [0, 0, 0], [255, 255, 255], [12, 250, 90], [250, 5, 240]] as Rgb[]) {
  const back = oklabToSrgb(...srgbToOklab(...colour));
  colour.forEach((channel, index) => assert.ok(Math.abs(channel - back[index]) <= 1, `${colour} -> ${back}`));
}
{
  const [L, a, b] = srgbToOklab(255, 255, 255);
  assert.ok(Math.abs(L - 1) < 1e-3 && Math.abs(a) < 1e-3 && Math.abs(b) < 1e-3);
  assert.ok(Math.abs(srgbToOklab(0, 0, 0)[0]) < 1e-6);
}

// Vivid colour outweighs grey, mid tones outweigh crushed black, and the
// weighting moves smoothly rather than in steps.
{
  const red = srgbToOklab(...RED);
  const grey = srgbToOklab(...GREY);
  assert.ok(glassPixelWeight(...red) > 4 * glassPixelWeight(...grey));
  assert.ok(glassPixelWeight(0.5, 0, 0) > glassPixelWeight(0.03, 0, 0));
  for (const L of [0.06, 0.13, 0.2, 0.88, 0.93, 0.98]) {
    assert.ok(Math.abs(glassPixelWeight(L, 0.05, 0) - glassPixelWeight(L + 1e-4, 0.05, 0)) < 1e-3);
  }
}

// A frame's sides take the colour that is actually along them.
const halves = glassPaletteFromPixels(fill(40, 30, (x) => (x < 20 ? RED : BLUE)), 40, 30)!;
{
  const red = srgbToOklab(...RED);
  const blue = srgbToOklab(...BLUE);
  assert.ok(labDistance(halves.edges.left, red) < labDistance(halves.edges.left, blue));
  assert.ok(labDistance(halves.edges.right, blue) < labDistance(halves.edges.right, red));
  assert.ok(labDistance(halves.mean, red) < labDistance(red, blue));
  assert.ok(labDistance(halves.mean, blue) < labDistance(red, blue));
  assert.equal(halves.grid.length, halves.gridColumns * halves.gridRows * 4);
}

// Colour-weighted: a fifth of vivid orange on grey pulls the palette far more
// than its share of pixels would.
{
  const pixels = fill(50, 50, (x) => (x < 10 ? ORANGE : GREY));
  const palette = glassPaletteFromPixels(pixels, 50, 50)!;
  const orange = srgbToOklab(...ORANGE);
  const grey = srgbToOklab(...GREY);
  const plainA = orange[1] * 0.2 + grey[1] * 0.8;
  const plainB = orange[2] * 0.2 + grey[2] * 0.8;
  assert.ok(Math.hypot(palette.mean[1], palette.mean[2]) > 2.5 * Math.hypot(plainA, plainB));
}

// Nothing opaque, no palette.
assert.equal(glassPaletteFromPixels(fill(8, 8, () => RED, 0), 8, 8), null);

// The field: a red frame on the left and a blue one on the right.
const redPalette = glassPaletteFromPixels(fill(32, 48, () => RED), 32, 48)!;
const bluePalette = glassPaletteFromPixels(fill(32, 48, () => BLUE), 32, 48)!;
const posterW = 1000;
const posterH = 800;
const pair = [
  { rect: { x: 100, y: 100, width: 300, height: 500 }, palette: redPalette },
  { rect: { x: 600, y: 100, width: 300, height: 500 }, palette: bluePalette }
];
const field = computeGlassField(posterW, posterH, pair, 3);
{
  assert.equal(field.width, GLASS_FIELD_WIDTH);
  assert.equal(field.height, Math.round((GLASS_FIELD_WIDTH * posterH) / posterW));
  assert.equal(field.rgba.length, field.width * field.height * 4);
  for (let i = 3; i < field.rgba.length; i += 4) assert.equal(field.rgba[i], 255);

  const red = srgbToOklab(...RED);
  const blue = srgbToOklab(...BLUE);
  const beside = (x: number, y: number) => {
    const lab = fieldLab(field, posterW, x, y);
    return { toRed: labDistance(lab, red), toBlue: labDistance(lab, blue) };
  };
  // Beside each frame the margin takes that frame's colour.
  const left = beside(40, 350);
  const right = beside(960, 350);
  assert.ok(left.toRed < left.toBlue, `left margin ${JSON.stringify(left)}`);
  assert.ok(right.toBlue < right.toRed, `right margin ${JSON.stringify(right)}`);
  // The gap between them is a blend, not either colour.
  const gap = beside(500, 350);
  assert.ok(gap.toRed / gap.toBlue > 0.5 && gap.toRed / gap.toBlue < 2, `gap ${JSON.stringify(gap)}`);
  // Far from both, the corners still carry the side their colour sits on.
  const topLeft = beside(5, 5);
  const topRight = beside(995, 5);
  assert.ok(topLeft.toRed < topRight.toRed && topRight.toBlue < topLeft.toBlue);
  // The chroma ceiling holds everywhere.
  for (let i = 0; i < field.rgba.length; i += 4) {
    const [, a, b] = srgbToOklab(field.rgba[i], field.rgba[i + 1], field.rgba[i + 2]);
    assert.ok(Math.hypot(a, b) <= 0.17);
  }
}

// Deterministic, and continuous: the preview samples a smaller rendition than
// the export, so a small change in pixels must be a small change in the field.
{
  assert.deepEqual(computeGlassField(posterW, posterH, pair, 3).rgba, field.rgba);
  let seed = 11;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648) * 8 - 4;
  };
  const jitter = (colour: Rgb): Rgb => colour.map((channel) => Math.round(channel + noise())) as Rgb;
  const noisy = [
    { rect: pair[0].rect, palette: glassPaletteFromPixels(fill(32, 48, () => jitter(RED)), 32, 48)! },
    { rect: pair[1].rect, palette: glassPaletteFromPixels(fill(32, 48, () => jitter(BLUE)), 32, 48)! }
  ];
  const nudged = computeGlassField(posterW, posterH, noisy, 3);
  let worst = 0;
  for (let i = 0; i < field.rgba.length; i += 1) worst = Math.max(worst, Math.abs(field.rgba[i] - nudged.rgba[i]));
  assert.ok(worst <= 4, `field moved ${worst} levels for ±4 of pixel noise`);
}

// More softness carries each frame's colour further, so close to the red frame
// in the gap the blue one shows through more.
{
  const red = srgbToOklab(...RED);
  const nearRed = (blur: number) =>
    labDistance(fieldLab(computeGlassField(posterW, posterH, pair, blur), posterW, 450, 350), red);
  assert.ok(nearRed(8) > nearRed(0.5), `soft ${nearRed(8)} vs crisp ${nearRed(0.5)}`);
}

// Nine frames on a tall poster stay cheap enough to recompute while dragging.
{
  const nine: { rect: { x: number; y: number; width: number; height: number }; palette: GlassPalette }[] = [];
  for (let i = 0; i < 9; i += 1) {
    nine.push({
      rect: { x: 60 + (i % 3) * 330, y: 80 + Math.floor(i / 3) * 560, width: 300, height: 520 },
      palette: i % 2 ? redPalette : bluePalette
    });
  }
  const timings: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    computeGlassField(1080, 1920, nine, 3);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[1] < 80, `nine-frame field took ${timings[1].toFixed(1)} ms`);
}

// Shadows fall under frames, a little more below than above, and nowhere else.
{
  const shadow = computeGlassShadow(1000, 1000, [{ x: 300, y: 300, width: 400, height: 400 }], 240);
  const at = (x: number, y: number) => shadow.alpha[Math.floor(y * 0.24) * shadow.width + Math.floor(x * 0.24)];
  assert.equal(at(50, 50), 0);
  assert.ok(at(500, 500) > 0);
  assert.ok(at(500, 712) > at(500, 288), "shadow is offset downward");

  // In the narrow gutter between two frames, at the default 0.65 % gap, the
  // shadows cancel instead of stacking into a dark line, while an open edge
  // keeps its shadow over the same width.
  const scale = 0.24;
  const pairShadow = computeGlassShadow(
    1000,
    1000,
    [
      { x: 100, y: 300, width: 397, height: 400 },
      { x: 503, y: 300, width: 397, height: 400 }
    ],
    240
  );
  const strongest = (fromX: number, toX: number) => {
    const row = Math.floor(500 * scale) * pairShadow.width;
    let best = 0;
    for (let cell = 0; cell < pairShadow.width; cell += 1) {
      const centre = (cell + 0.5) / scale;
      if (centre >= fromX && centre <= toX) best = Math.max(best, pairShadow.alpha[row + cell]);
    }
    return best;
  };
  const gutter = strongest(497, 503);
  const openEdge = strongest(94, 100);
  assert.ok(openEdge > 0, "open edge keeps its shadow");
  assert.ok(gutter * 3 < openEdge, `gutter ${gutter} vs open edge ${openEdge}`);
}

// Grain is the same every time from the same seed, about half light, and faint.
{
  const tile = glassGrainTile();
  assert.deepEqual(glassGrainTile(), tile);
  assert.notDeepEqual(glassGrainTile(64, 1), tile);
  let light = 0;
  for (let i = 0; i < tile.length; i += 4) {
    if (tile[i] === 255) light += 1;
    assert.ok(tile[i + 3] > 0 && tile[i + 3] < 16);
  }
  const share = light / (tile.length / 4);
  assert.ok(share > 0.45 && share < 0.55, `light share ${share}`);
}

// --- Crop modes ---------------------------------------------------------------

// A pre-change photo entry (no crop mode) must still validate, and the manual
// mode must carry its anchor.
{
  const photo = { photoId: "p", weight: 3, focalX: 0.5, focalY: 0.5 };
  const withCrop = (crop: unknown) => sharingPosterCompositionSchema.safeParse({ ...composition, photos: [{ ...photo, crop }] }).success;
  assert.equal(sharingPosterCompositionSchema.safeParse({ ...composition, photos: [photo] }).success, true);
  assert.equal(withCrop({ mode: "auto" }), true);
  assert.equal(withCrop({ mode: "manual", x: 0.2, y: 0.9 }), true);
  assert.equal(withCrop({ mode: "manual" }), false, "manual needs an anchor");
  assert.equal(withCrop({ mode: "manual", x: 1.5, y: 0 }), false);
}

// An anchored crop centres on the anchor and clamps at both image edges.
assert.equal(coverCropFromAnchor(3000, 2000, 500, 500, { x: 0.5, y: 0.5 }).x, 500);
assert.equal(coverCropFromAnchor(3000, 2000, 500, 500, { x: 0.05, y: 0.5 }).x, 0);
assert.equal(coverCropFromAnchor(3000, 2000, 500, 500, { x: 0.95, y: 0.5 }).x, 1000);
// When the subject box fits the window, the window is nudged to keep it whole.
{
  const nudged = coverCropFromAnchor(3000, 2000, 500, 500, { x: 0.5, y: 0.5 }, { x: 0.05, y: 0.2, width: 0.4, height: 0.6 });
  assert.ok(nudged.x <= 0.05 * 3000 + 1e-9, "window starts at or before the box");
  assert.ok(nudged.x + nudged.width >= 0.45 * 3000 - 1e-9, "window ends at or after the box");
}
// A box wider than the window cannot be kept whole; the anchor still rules.
assert.equal(coverCropFromAnchor(3000, 2000, 500, 500, { x: 0.5, y: 0.5 }, { x: 0, y: 0, width: 1, height: 1 }).x, 500);

// The legacy focal crop and its anchor equivalent produce the same window.
for (const [frameWidth, frameHeight] of [[500, 500], [900, 300], [300, 900]] as const) {
  for (const focal of [0, 0.25, 0.5, 1]) {
    const legacy = coverCropSource(3000, 2000, frameWidth, frameHeight, focal, focal);
    const anchor = legacyFocalToAnchor(3000, 2000, frameWidth, frameHeight, focal, focal);
    const viaAnchor = coverCropFromAnchor(3000, 2000, frameWidth, frameHeight, anchor);
    assert.ok(Math.abs(viaAnchor.x - legacy.x) < 1e-6 && Math.abs(viaAnchor.y - legacy.y) < 1e-6, `focal ${focal} in ${frameWidth}x${frameHeight}`);
    // And the anchor round-trips through the crop it produced.
    const back = cropRectToAnchor(viaAnchor, 3000, 2000);
    assert.ok(Math.abs(back.x - anchor.x) < 1e-9 && Math.abs(back.y - anchor.y) < 1e-9);
  }
}

// resolvePosterCrop: absent mode is the legacy crop; auto falls back to centre
// without a subject and follows it with one; manual uses its anchor.
{
  const legacyEntry = { focalX: 0, focalY: 0 };
  assert.deepEqual(resolvePosterCrop(legacyEntry, null, 3000, 2000, 500, 500), coverCropSource(3000, 2000, 500, 500, 0, 0));
  const autoEntry = { focalX: 0, focalY: 0, crop: { mode: "auto" as const } };
  assert.equal(resolvePosterCrop(autoEntry, null, 3000, 2000, 500, 500).x, 500);
  assert.equal(resolvePosterCrop(autoEntry, { x: 0.9, y: 0.5, box: null }, 3000, 2000, 500, 500).x, 1000);
  const manualEntry = { focalX: 0, focalY: 0, crop: { mode: "manual" as const, x: 0.1, y: 0.5 } };
  assert.equal(resolvePosterCrop(manualEntry, { x: 0.9, y: 0.5, box: null }, 3000, 2000, 500, 500).x, 0);
}

// Dragging by a quarter of the frame moves the crop by a quarter of its window.
{
  const rect = { width: 400, height: 400 };
  const startCrop = coverCropFromAnchor(3000, 2000, rect.width, rect.height, { x: 0.5, y: 0.5 });
  const scale = startCrop.width / rect.width;
  const moved = startCrop.x - (rect.width / 4) * scale;
  assert.ok(Math.abs(startCrop.x - moved - startCrop.width / 4) < 1e-9);
}

// --- Subject-aware layout ----------------------------------------------------

// A portrait whose subject spans most of its height gets a taller-than-wide
// frame when paired with a landscape; without subject data the layout is
// exactly the aspect-only result.
{
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  const portrait = { id: "portrait", width: 2000, height: 3000, weight: 3 };
  const landscape = { id: "landscape", width: 3000, height: 2000, weight: 3 };
  const withSubject = calculateSharingPosterLayout(
    [{ ...portrait, subject: { x: 0.5, y: 0.45, box: { x: 0.3, y: 0.05, width: 0.4, height: 0.8 } } }, { ...landscape, subject: null }],
    area,
    0
  );
  const portraitRect = withSubject.find((rect) => rect.id === "portrait")!;
  assert.ok(portraitRect.height > portraitRect.width, "the portrait subject should win a tall frame");
  const explicitNull = calculateSharingPosterLayout([{ ...portrait, subject: null }, { ...landscape, subject: null }], area, 0);
  const noField = calculateSharingPosterLayout([portrait, landscape], area, 0);
  assert.deepEqual(explicitNull, noField, "no subject data must not change the layout");
}

console.log("Sharing poster layout and composition tests passed.");
