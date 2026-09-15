import assert from "node:assert/strict";
import {
  defaultSharingPosterComposition,
  sharingPosterCompositionSchema,
  sharingPosterPixelSize
} from "../src/lib/sharingPoster";
import {
  calculateSharingPosterLayout,
  coverCropSource
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
composition.export.longestEdge = 4096;
composition.ratio = { width: 1, height: 1 };
const pixels = sharingPosterPixelSize(composition);
assert(pixels.width * pixels.height <= 12_000_000);
assert.equal(sharingPosterCompositionSchema.safeParse({
  ...composition,
  photos: [
    { photoId: "same", weight: 3, focalX: 0.5, focalY: 0.5 },
    { photoId: "same", weight: 3, focalX: 0.5, focalY: 0.5 }
  ]
}).success, false);

console.log("Sharing poster layout and composition tests passed.");
