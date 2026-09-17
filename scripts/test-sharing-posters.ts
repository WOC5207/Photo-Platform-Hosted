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
import { glassEdgeStrips } from "../src/lib/sharingPosterGlass";
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

// --- Glass edge strips -------------------------------------------------------

// The eight strips plus the frame tile the canvas exactly, with no overlap.
{
  const bounds = { x: 0, y: 0, width: 240, height: 300 };
  const rect = { x: 40, y: 50, width: 100, height: 120 };
  const strips = glassEdgeStrips(rect, bounds);
  assert.equal(strips.length, 8);
  const pieces = [rect, ...strips.map((strip) => strip.dest)];
  const area = pieces.reduce((sum, piece) => sum + piece.width * piece.height, 0);
  assert.equal(area, bounds.width * bounds.height);
  for (const piece of pieces) {
    assert.ok(piece.x >= bounds.x && piece.y >= bounds.y);
    assert.ok(piece.x + piece.width <= bounds.x + bounds.width);
    assert.ok(piece.y + piece.height <= bounds.y + bounds.height);
  }
  for (let a = 0; a < pieces.length; a += 1) {
    for (let b = a + 1; b < pieces.length; b += 1) {
      const pa = pieces[a];
      const pb = pieces[b];
      if (pa.width === 0 || pa.height === 0 || pb.width === 0 || pb.height === 0) continue;
      assert.ok(!overlaps(pa, pb), `strips ${a}/${b} overlap`);
    }
  }
}
// A frame touching the canvas edge extends nothing on that side.
{
  const strips = glassEdgeStrips({ x: 0, y: 20, width: 80, height: 60 }, { x: 0, y: 0, width: 240, height: 300 });
  const byEdge = Object.fromEntries(strips.map((strip) => [strip.edge, strip.dest]));
  assert.equal(byEdge.left.width, 0);
  assert.equal(byEdge.topLeft.width, 0);
  assert.equal(byEdge.bottomLeft.width, 0);
  assert.equal(byEdge.right.width, 160);
  assert.equal(byEdge.top.height, 20);
  assert.equal(byEdge.bottom.height, 220);
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
