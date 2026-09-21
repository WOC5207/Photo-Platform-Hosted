import assert from "node:assert/strict";
import {
  SHARING_POSTER_CREDIT_LABEL_MAX,
  SHARING_POSTER_MAX_CREDIT_LINES,
  SHARING_POSTER_MAX_EDGE,
  SHARING_POSTER_MAX_PIXELS,
  defaultSharingPosterComposition,
  legacyTextGapPercent,
  moveSharingPosterCreditLine,
  parseSharingPosterComposition,
  sharingPosterCompositionSchema,
  sharingPosterCreditLabel,
  sharingPosterCreditLines,
  sharingPosterCreditMetadataValue,
  sharingPosterPixelSize,
  withSharingPosterMetadata,
  type SharingPosterCreditKind,
  type SharingPosterCreditLine
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
  posterLayoutItems,
  resolvePosterCrop,
  type PosterLayoutSource
} from "../src/lib/sharingPosterLayout";
import {
  SHARING_POSTER_RATIO_EXTRAS,
  SHARING_POSTER_RATIO_PRESETS,
  candidatePosterRatios,
  evaluatePosterRatio,
  pickPosterRatioSuggestion,
  posterRatioLabel,
  sameRatio,
  suggestPosterRatio
} from "../src/lib/sharingPosterRatio";

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
  // Zero lines is not a legacy state (version 1 always printed CN and
  // photographer); it drops the footer and is covered with the credit lines.
  [1080, 1920, 2.5, 1.8, 1]
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

// --- Ratio suggestion -----------------------------------------------------------

type Box = { x: number; y: number; width: number; height: number };
const tallFigure: Box = { x: 0.33, y: 0.1, width: 0.34, height: 0.8 };
const leftFigure: Box = { x: 0.15, y: 0.1, width: 0.2, height: 0.82 };
const withSubject = (box: Box | null) => (box ? { x: box.x + box.width / 2, y: box.y + box.height * 0.3, box } : null);
function posterPhoto(
  id: string,
  width: number,
  height: number,
  box: Box | null,
  crop: PosterLayoutSource["composition"]["crop"] = { mode: "auto" }
): PosterLayoutSource {
  return {
    photoId: id,
    composition: { weight: 3, focalX: 0.5, focalY: 0.5, crop },
    source: { width, height, subject: withSubject(box) }
  };
}
const ratioStyle = { marginPercent: 2.5, gapPercent: 0.65, footerTextPercent: 1.8, textGapPercent: 2.5 };

// Names: presets and common ratios by their usual name, anything else reduced.
assert.equal(posterRatioLabel({ width: 18, height: 9 }), "18:9");
assert.equal(posterRatioLabel({ width: 8, height: 10 }), "4:5");
assert.equal(posterRatioLabel({ width: 7, height: 10 }), "7:10");
assert.equal(posterRatioLabel({ width: 30, height: 40 }), "3:4");
assert.ok(sameRatio({ width: 8, height: 10 }, { width: 4, height: 5 }));
assert.ok(!sameRatio({ width: 3, height: 4 }, { width: 4, height: 3 }));

// Candidates: the presets in their order, then the common extras, then the
// current ratio only if it is none of those.
{
  const standard = candidatePosterRatios({ width: 8, height: 10 });
  assert.equal(standard.length, SHARING_POSTER_RATIO_PRESETS.length + SHARING_POSTER_RATIO_EXTRAS.length);
  assert.deepEqual(standard[0], { width: 1, height: 1 });
  const custom = candidatePosterRatios({ width: 7, height: 10 });
  assert.equal(custom.length, standard.length + 1);
  assert.deepEqual(custom.at(-1), { width: 7, height: 10 });
}

// The layout input the renderer and the suggestion share: the subject only
// for a crop that follows it, and a placeholder size for an unavailable photo.
{
  const items = posterLayoutItems([
    posterPhoto("auto", 4000, 6000, tallFigure),
    posterPhoto("manual", 4000, 6000, tallFigure, { mode: "manual", x: 0.2, y: 0.5 }),
    {
      photoId: "legacy",
      composition: { weight: 3, focalX: 0.5, focalY: 0.5 },
      source: { width: 4000, height: 6000, subject: withSubject(tallFigure) }
    },
    { photoId: "gone", composition: { weight: 2, focalX: 0.5, focalY: 0.5 }, source: null }
  ]);
  assert.ok(items[0].subject?.box);
  assert.equal(items[1].subject, null);
  assert.equal(items[2].subject, null);
  assert.deepEqual([items[3].width, items[3].height, items[3].weight], [1, 1, 2]);
}

// Portraits with tall subjects: away from a wide poster, to a tall one that
// keeps every subject whole and more of every photograph.
{
  const portraits = [0, 1, 2, 3].map((i) => posterPhoto(`p${i}`, 4000, 6000, tallFigure));
  const suggestion = suggestPosterRatio({ width: 16, height: 9 }, portraits, ratioStyle, 2)!;
  assert.ok(suggestion.switchSuggested);
  assert.ok(suggestion.best.ratio.height > suggestion.best.ratio.width, posterRatioLabel(suggestion.best.ratio));
  assert.equal(suggestion.best.subjects, 4);
  assert.equal(suggestion.best.subjectsWhole, 4);
  assert.ok(suggestion.best.shown > suggestion.current.shown + 0.1);
  assert.ok(suggestion.best.subjectShown! >= suggestion.current.subjectShown!);
  assert.ok(Math.abs(suggestion.best.subjectShown! - 1) < 1e-9);
  // Deterministic.
  assert.deepEqual(suggestPosterRatio({ width: 16, height: 9 }, portraits, ratioStyle, 2), suggestion);
}

// With automatic crops the solver shapes frames around a figure standing off
// to one side, so every candidate keeps it whole.
{
  const pair = [0, 1].map((i) => posterPhoto(`l${i}`, 6000, 4000, leftFigure));
  for (const ratio of candidatePosterRatios({ width: 16, height: 9 })) {
    assert.equal(evaluatePosterRatio(ratio, pair, ratioStyle, 2).subjectsWhole, 2, posterRatioLabel(ratio));
  }
}

// A manual crop anchored away from the figure is where the ratio decides:
// narrow frames cut the figure off, and the suggestion is a ratio that does not.
{
  const offAnchor = [posterPhoto("m", 6000, 4000, leftFigure, { mode: "manual", x: 0.85, y: 0.5 })];
  const reports = candidatePosterRatios({ width: 1, height: 1 }).map((ratio) =>
    evaluatePosterRatio(ratio, offAnchor, ratioStyle, 2)
  );
  assert.ok(reports.some((report) => report.subjectsWhole === 0), "some ratio must cut the figure off");
  const suggestion = pickPosterRatioSuggestion({ width: 1, height: 1 }, reports)!;
  assert.equal(suggestion.current.subjectsWhole, 0);
  assert.ok(suggestion.switchSuggested);
  assert.equal(suggestion.best.subjectsWhole, 1);
}

// A manual crop that cuts the subject off still counts as a cut-off subject,
// even though the layout itself only follows subjects for automatic crops.
{
  const square = { width: 1, height: 1 };
  const auto = evaluatePosterRatio(square, [posterPhoto("a", 6000, 4000, leftFigure)], ratioStyle, 2);
  const manual = evaluatePosterRatio(
    square,
    [posterPhoto("m", 6000, 4000, leftFigure, { mode: "manual", x: 0.85, y: 0.5 })],
    ratioStyle,
    2
  );
  assert.equal(auto.subjects, 1);
  assert.equal(manual.subjects, 1);
  assert.ok(auto.subjectsWhole === 1 || auto.cost < manual.cost);
  assert.equal(manual.subjectsWhole, 0);
  assert.ok(manual.cost > auto.cost);
}

// The rule a suggestion follows: keep at least as much of both the subjects
// and the photographs in view, within a point, and clearly more of one. The
// owner sees exactly those two numbers, so a suggestion never trades one for
// the other behind their back.
{
  const report = (ratio: [number, number], cost: number, shown: number, subjectShown: number | null) => ({
    ratio: { width: ratio[0], height: ratio[1] },
    cost,
    shown,
    subjectShown,
    subjects: subjectShown === null ? 0 : 1,
    subjectsWhole: subjectShown === 1 ? 1 : 0,
    photoShare: 0.8,
    footerTooTall: false
  });
  const current = report([4, 3], 0.43, 0.83, 0.95);

  // The poster that prompted this rule: 1:1 shows more of the photographs but
  // cuts further into a subject, and is cheaper by the internal cost. It is a
  // trade-off, not an improvement, so the current ratio stands.
  const tradeOff = pickPosterRatioSuggestion({ width: 4, height: 3 }, [current, report([1, 1], 0.4, 0.88, 0.92)])!;
  assert.equal(tradeOff.switchSuggested, false);
  assert.ok(sameRatio(tradeOff.best.ratio, { width: 4, height: 3 }));

  // Too small a gain to be worth a switch.
  assert.equal(
    pickPosterRatioSuggestion({ width: 4, height: 3 }, [current, report([1, 1], 0.2, 0.84, 0.955)])!.switchSuggested,
    false
  );

  // A clear gain in either share, the other held, is suggested even when the
  // internal cost is higher.
  const morePhoto = pickPosterRatioSuggestion({ width: 4, height: 3 }, [current, report([9, 16], 0.9, 0.9, 0.95)])!;
  assert.ok(morePhoto.switchSuggested && sameRatio(morePhoto.best.ratio, { width: 9, height: 16 }));
  const moreSubject = pickPosterRatioSuggestion({ width: 4, height: 3 }, [current, report([2, 3], 0.9, 0.825, 1)])!;
  assert.ok(moreSubject.switchSuggested && sameRatio(moreSubject.best.ratio, { width: 2, height: 3 }));

  // Among improvements that neither beats the other, the cost decides.
  const several = pickPosterRatioSuggestion({ width: 4, height: 3 }, [
    current,
    report([9, 16], 0.5, 0.9, 0.99),
    report([2, 3], 0.3, 0.885, 1)
  ])!;
  assert.ok(sameRatio(several.best.ratio, { width: 2, height: 3 }));

  // A suggestion is final: when the cheapest improvement can itself be
  // improved on, the ratio that improves on both is suggested instead, and
  // taking it leaves nothing further to suggest.
  const chain = [
    current,
    report([1, 1], 0.2, 0.86, 0.95),
    report([2, 3], 0.6, 0.9, 1)
  ];
  const final = pickPosterRatioSuggestion({ width: 4, height: 3 }, chain)!;
  assert.ok(sameRatio(final.best.ratio, { width: 2, height: 3 }), posterRatioLabel(final.best.ratio));
  assert.equal(pickPosterRatioSuggestion({ width: 2, height: 3 }, chain)!.switchSuggested, false);

  // Without detected subjects only the photographs count.
  const photosOnly = pickPosterRatioSuggestion({ width: 4, height: 5 }, [
    report([4, 5], 0.6, 0.6, null),
    report([9, 16], 0.2, 0.86, null)
  ])!;
  assert.ok(photosOnly.switchSuggested && photosOnly.best.subjectShown === null);
}

// Whatever is suggested for real photographs holds to that rule.
{
  const mixed = [
    ...[0, 1, 2].map((i) => posterPhoto(`p${i}`, 4000, 6000, tallFigure)),
    ...[0, 1, 2].map((i) => posterPhoto(`l${i}`, 6000, 4000, null))
  ];
  for (const current of candidatePosterRatios({ width: 4, height: 5 })) {
    const suggestion = suggestPosterRatio(current, mixed, ratioStyle, 2)!;
    if (!suggestion.switchSuggested) continue;
    // Taking the suggestion settles it.
    assert.equal(
      suggestPosterRatio(suggestion.best.ratio, mixed, ratioStyle, 2)!.switchSuggested,
      false,
      `${posterRatioLabel(current)} -> ${posterRatioLabel(suggestion.best.ratio)}`
    );
    assert.ok(suggestion.best.shown >= suggestion.current.shown - 0.01, posterRatioLabel(current));
    assert.ok(suggestion.best.subjectShown! >= suggestion.current.subjectShown! - 0.01, posterRatioLabel(current));
    assert.ok(
      suggestion.best.shown >= suggestion.current.shown + 0.02 ||
        suggestion.best.subjectShown! >= suggestion.current.subjectShown! + 0.02,
      posterRatioLabel(current)
    );
  }
}

// A ratio whose credits would crowd the photographs out is never suggested,
// and one the owner is on is always worth leaving.
{
  const crowded = { ...ratioStyle, footerTextPercent: 4 };
  const portraits = [0, 1].map((i) => posterPhoto(`p${i}`, 4000, 6000, tallFigure));
  const reports = candidatePosterRatios({ width: 18, height: 9 }).map((ratio) =>
    evaluatePosterRatio(ratio, portraits, crowded, 8)
  );
  assert.ok(reports.some((report) => report.footerTooTall), "fixture must crowd some ratio");
  const suggestion = pickPosterRatioSuggestion({ width: 18, height: 9 }, reports)!;
  assert.equal(suggestion.best.footerTooTall, false);
  if (suggestion.current.footerTooTall) assert.ok(suggestion.switchSuggested);
}

// Nothing to suggest without photographs to lay out.
assert.equal(suggestPosterRatio({ width: 4, height: 5 }, [], ratioStyle, 2), null);
assert.equal(
  suggestPosterRatio(
    { width: 4, height: 5 },
    [{ photoId: "gone", composition: { weight: 3, focalX: 0.5, focalY: 0.5 }, source: null }],
    ratioStyle,
    2
  ),
  null
);

// Nine photographs, every candidate: cheap enough to run after edits settle.
{
  const nine = Array.from({ length: 9 }, (_, i) =>
    posterPhoto(`n${i}`, i % 3 ? 4000 : 6000, i % 3 ? 6000 : 4000, i % 2 ? tallFigure : null)
  );
  const started = performance.now();
  suggestPosterRatio({ width: 4, height: 5 }, nine, ratioStyle, 2);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1500, `nine-photo suggestion took ${elapsed.toFixed(0)} ms`);
}

// Credit lines: layers printed top to bottom, each "Title: value" or custom text.
{
  const zh = defaultSharingPosterComposition("zh", "摄影师甲");
  assert.equal(zh.version, 2);
  assert.deepEqual(zh.credits.lines, [
    { id: "cosplayer", kind: "cosplayer", value: "" },
    { id: "photographer", kind: "photographer", value: "摄影师甲" }
  ]);
  // An empty line prints nothing, like an empty text layer.
  assert.deepEqual(sharingPosterCreditLines(zh), ["摄影: 摄影师甲"]);

  const line = (id: string, kind: SharingPosterCreditKind, value: string, label?: string): SharingPosterCreditLine =>
    label === undefined ? { id, kind, value } : { id, kind, label, value };
  const layered = {
    ...zh,
    credits: {
      ...zh.credits,
      lines: [
        line("note", "custom", "  Thanks   for\nwatching  "),
        line("gear", "equipment", "Sony α7 IV + FE 85mm F1.4 GM"),
        line("cn", "cosplayer", "某 CN", "Coser"),
        line("ph", "photographer", "摄影师甲", " 摄影 & 后期： "),
        line("when", "date", ""),
        line("where", "location", "Toronto\n\nHarbourfront")
      ]
    }
  };
  assert.deepEqual(sharingPosterCreditLines(layered), [
    "Thanks for / watching",
    "器材: Sony α7 IV + FE 85mm F1.4 GM",
    "Coser: 某 CN",
    "摄影 & 后期: 摄影师甲",
    "地点: Toronto / Harbourfront"
  ]);
  const en = defaultSharingPosterComposition("en", "Ann");
  en.credits.lines.push(line("gear", "equipment", "Body + Lens"), line("e", "event", "Expo"));
  assert.deepEqual(sharingPosterCreditLines(en), ["Photographer: Ann", "Equipment: Body + Lens", "Event: Expo"]);
  assert.equal(sharingPosterCreditLabel("Model\nand  stylist:", "Cosplayer CN"), "Model and stylist");
  assert.equal(sharingPosterCreditLabel(undefined, "Photographer"), "Photographer");

  // Gallery metadata fills the lines it knows and leaves the owner's alone.
  const metadata = {
    cosplayer: "A / B",
    camera: "ILCE-7M4",
    lens: "FE 85mm F1.4 GM",
    event: "Expo\nExpo\nFair",
    date: "2026-09-01\n2026-09-01",
    location: "Hall 1\nHall 2"
  };
  assert.equal(sharingPosterCreditMetadataValue("equipment", metadata), "ILCE-7M4 + FE 85mm F1.4 GM");
  assert.equal(sharingPosterCreditMetadataValue("equipment", { ...metadata, lens: " " }), "ILCE-7M4");
  assert.equal(sharingPosterCreditMetadataValue("event", metadata), "Expo / Fair");
  assert.equal(sharingPosterCreditMetadataValue("date", metadata), "2026-09-01");
  assert.equal(sharingPosterCreditMetadataValue("photographer", metadata), null);
  assert.equal(sharingPosterCreditMetadataValue("custom", metadata), null);
  const refilled = withSharingPosterMetadata(layered.credits.lines, metadata);
  assert.deepEqual(
    refilled.map((entry) => entry.value),
    ["  Thanks   for\nwatching  ", "ILCE-7M4 + FE 85mm F1.4 GM", "A / B", "摄影师甲", "2026-09-01", "Hall 1 / Hall 2"]
  );
  assert.equal(refilled[2].label, "Coser");

  // Reordering moves one layer and leaves the array alone when nothing moves.
  const ids = (lines: SharingPosterCreditLine[]) => lines.map((entry) => entry.id);
  const lines = layered.credits.lines;
  assert.deepEqual(ids(moveSharingPosterCreditLine(lines, "where", 0)), ["where", "note", "gear", "cn", "ph", "when"]);
  assert.deepEqual(ids(moveSharingPosterCreditLine(lines, "note", 2)), ["gear", "cn", "note", "ph", "when", "where"]);
  assert.deepEqual(ids(moveSharingPosterCreditLine(lines, "gear", 99)), ["note", "cn", "ph", "when", "where", "gear"]);
  assert.equal(moveSharingPosterCreditLine(lines, "cn", 2), lines);
  assert.equal(moveSharingPosterCreditLine(lines, "missing", 0), lines);

  // The schema: layers round-trip; bad ones are refused.
  assert.deepEqual(sharingPosterCompositionSchema.parse(layered).credits, layered.credits);
  const withLines = (next: unknown[]) => ({ ...zh, credits: { ...zh.credits, lines: next } });
  assert.equal(sharingPosterCompositionSchema.safeParse(withLines([line("a", "custom", "x"), line("a", "date", "y")])).success, false);
  assert.equal(sharingPosterCompositionSchema.safeParse(withLines([{ id: "a", kind: "camera", value: "x" }])).success, false);
  assert.equal(
    sharingPosterCompositionSchema.safeParse(withLines([line("a", "date", "x", "t".repeat(SHARING_POSTER_CREDIT_LABEL_MAX + 1))])).success,
    false
  );
  const many = Array.from({ length: SHARING_POSTER_MAX_CREDIT_LINES }, (_, index) => line(`c${index}`, "custom", `${index}`));
  assert.equal(sharingPosterCompositionSchema.safeParse(withLines(many)).success, true);
  assert.equal(sharingPosterCompositionSchema.safeParse(withLines([...many, line("over", "custom", "x")])).success, false);
  assert.equal(sharingPosterCompositionSchema.safeParse(withLines([])).success, true);
}

// Version 1 projects migrate on parse: fixed fields become layers in the
// order they printed, hidden details are dropped, camera and lens become one
// equipment line, and nothing else about the project changes.
{
  const base = defaultSharingPosterComposition("zh", "摄影师甲", [{ id: "p1", homeWeight: 3 }, { id: "p2" }]);
  const rest = { ...base } as Partial<typeof base>;
  delete rest.credits;
  delete rest.version;
  const legacyCredits = {
    cosplayer: "某 CN",
    cosplayerReviewed: true,
    photographer: "摄影师甲",
    photographerLabel: "摄影 & 后期",
    camera: "ILCE-7M4",
    lens: "FE 85mm F1.4 GM",
    event: "Expo\nFair",
    date: "2026-09-01\n2026-09-02",
    location: "Hall 1\nHall 2",
    showCamera: true,
    showLens: true,
    showEvent: true,
    showDate: false,
    showLocation: true
  };
  const legacy = { ...rest, version: 1, credits: legacyCredits };
  const migrated = sharingPosterCompositionSchema.parse(legacy);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.credits, {
    lines: [
      { id: "cosplayer", kind: "cosplayer", value: "某 CN" },
      { id: "photographer", kind: "photographer", label: "摄影 & 后期", value: "摄影师甲" },
      { id: "equipment", kind: "equipment", value: "ILCE-7M4 + FE 85mm F1.4 GM" },
      { id: "event", kind: "event", value: "Expo / Fair" },
      { id: "location", kind: "location", value: "Hall 1 / Hall 2" }
    ],
    cosplayerReviewed: true
  });
  assert.deepEqual({ ...migrated, credits: base.credits, version: base.version }, base);
  assert.deepEqual(sharingPosterCreditLines(migrated), [
    "出镜 / CN: 某 CN",
    "摄影 & 后期: 摄影师甲",
    "器材: ILCE-7M4 + FE 85mm F1.4 GM",
    "活动: Expo / Fair",
    "地点: Hall 1 / Hall 2"
  ]);
  // Only the lens shown, then nothing optional shown.
  const lensOnly = sharingPosterCompositionSchema.parse({
    ...legacy,
    credits: { ...legacyCredits, showCamera: false, showEvent: false, showLocation: false }
  });
  assert.deepEqual(lensOnly.credits.lines.map((entry) => `${entry.kind}:${entry.value}`), [
    "cosplayer:某 CN",
    "photographer:摄影师甲",
    "equipment:FE 85mm F1.4 GM"
  ]);
  const bare = sharingPosterCompositionSchema.parse({
    ...legacy,
    credits: { ...legacyCredits, showCamera: false, showLens: false, showEvent: false, showLocation: false }
  });
  assert.deepEqual(bare.credits.lines.map((entry) => entry.kind), ["cosplayer", "photographer"]);
  // The fallback is never used for a valid version 1 project.
  const fallback = defaultSharingPosterComposition("en", "Nobody");
  assert.deepEqual(parseSharingPosterComposition(legacy, fallback), migrated);
  assert.equal(parseSharingPosterComposition({ ...legacy, version: 3 }, fallback), fallback);
}

// With no credit lines there is no footer: the photographs keep even margins.
{
  const none = sharingPosterFooterGeometry({ width: 1000, height: 1250, lineCount: 0, marginPercent: 2.5, footerTextPercent: 1.8, textGapPercent: 2.5 });
  assert.equal(none.photoArea.y, 25);
  assert.equal(none.photoArea.height, 1250 - 50);
  assert.equal(none.footerTooTall, false);
  const legacyNone = sharingPosterFooterGeometry({ width: 1000, height: 1250, lineCount: 0, marginPercent: 2.5, footerTextPercent: 1.8 });
  assert.equal(legacyNone.photoArea.height, 1250 - 50);
}

console.log("Sharing poster layout and composition tests passed.");
