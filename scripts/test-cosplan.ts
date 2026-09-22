import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { allowedBangumiImageUrl } from "../src/lib/bangumi";
import { detectCosplanSlotCandidates } from "../src/lib/cosplanSlotDetection";
import {
  cosplanCharacterCacheDir,
  cosplanTemplatePath,
  deleteCosplanTemplateAssets,
  generateCosplanForeground,
  storeCosplanTemplate,
  trimCharacterCache,
  validCosplanDimensions
} from "../src/lib/cosplanStorage";
import {
  normalizeCosplanLayerOrder,
  cosplanCharacterNames,
  parseCosplanSlots,
  scaleCosplanSlots,
  type CosplanLayer
} from "../src/lib/cosplanTypes";

async function exists(filePath: string) {
  return fs.stat(filePath).then(() => true).catch(() => false);
}

async function main() {
  assert.equal(validCosplanDimensions(1080, 1350), true);
  assert.equal(validCosplanDimensions(4096, 2929), true);
  assert.equal(validCosplanDimensions(4096, 4096), false);
  assert.equal(validCosplanDimensions(319, 1080), false);
  assert.equal(validCosplanDimensions(1080.5, 1350), false);
  assert.equal(cosplanTemplatePath("../escape"), null);
  const slots = parseCosplanSlots([
    { id: "day-1", nameEn: "Friday", nameZh: "第一天", x: 20, y: 40, width: 200, height: 400 }
  ], 720, 900);
  assert.equal(slots.length, 1);
  assert.deepEqual(scaleCosplanSlots(slots, 720, 900, 1440, 1800)[0], {
    id: "day-1", nameEn: "Friday", nameZh: "第一天", x: 40, y: 80, width: 400, height: 800
  });
  const irregularSlots = parseCosplanSlots([{
    ...slots[0],
    id: "irregular-1",
    shape: { type: "polygon", contours: [[
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.35 },
      { x: 0.45, y: 0.35 }, { x: 0.45, y: 1 }, { x: 0, y: 1 }
    ]] }
  }], 720, 900);
  assert.equal(irregularSlots.length, 1);
  assert.deepEqual(scaleCosplanSlots(irregularSlots, 720, 900, 1440, 1800)[0]?.shape, irregularSlots[0]?.shape);
  assert.equal(parseCosplanSlots([{ ...slots[0], x: 700 }], 720, 900).length, 0);
  const layers = normalizeCosplanLayerOrder([
    { id: "text", type: "text", name: "Caption", text: "Caption", x: 0, y: 0, width: 100, rotation: 0, fontSize: 20, fill: "#000000", align: "left", bold: false, fontFamily: "Arial" },
    { id: "image-a", type: "image", name: "A", src: "a", x: 0, y: 0, width: 100, height: 100, rotation: 0, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 },
    { id: "image-b", type: "image", name: "B", src: "b", x: 0, y: 0, width: 100, height: 100, rotation: 0, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }
  ] satisfies CosplanLayer[]);
  assert.deepEqual(layers.map((layer) => layer.id), ["image-a", "image-b", "text"]);
  assert.equal(layers[0]?.type === "image" && layers[0].drawForeground, false);
  assert.equal(layers[1]?.type === "image" && layers[1].drawForeground, true);
  const namedSlots = parseCosplanSlots([{ ...slots[0], nameText: { x: 20, y: 440, width: 200, height: 48, fontSize: 28, fill: "#ffffff", align: "center", bold: true } }], 720, 900);
  assert.equal(namedSlots.length, 1);
  assert.equal(namedSlots[0].nameText?.y, 440);
  assert.deepEqual(scaleCosplanSlots(namedSlots, 720, 900, 1440, 1800)[0].nameText, { x: 40, y: 880, width: 400, height: 96, fontSize: 56, fill: "#ffffff", align: "center", bold: true });
  for (const patch of [{ x: -1 }, { width: 900 }, { fontSize: 0 }, { fill: "red" }, { align: "invalid" }, { bold: "yes" }]) {
    assert.equal(parseCosplanSlots([{ ...namedSlots[0], nameText: { ...namedSlots[0].nameText, ...patch } }], 720, 900).length, 0);
  }
  const assigned = layers.map((layer) => layer.type === "image" ? { ...layer, slotId: "day-1" } : layer);
  assert.equal(cosplanCharacterNames(namedSlots, assigned)[0].text, "B");
  assert.equal(cosplanCharacterNames(namedSlots, assigned.filter((layer) => layer.id !== "image-b"))[0].text, "A");
  assert.equal(cosplanCharacterNames(namedSlots, layers).length, 0);
  assert.equal(cosplanCharacterNames(slots, assigned).length, 0);
  assert.deepEqual(cosplanCharacterNames(JSON.parse(JSON.stringify(namedSlots)), JSON.parse(JSON.stringify(assigned))), cosplanCharacterNames(namedSlots, assigned));
  console.log("PASS  linked character names validate, scale, restore, and follow assigned image layers");
  assert.ok(allowedBangumiImageUrl("https://lain.bgm.tv/pic/crt/m/example.jpg"));
  for (const blocked of [
    "http://lain.bgm.tv/pic/crt/m/example.jpg",
    "https://evil.example/image.png",
    "https://lain.bgm.tv.evil.example/image.png",
    "https://user:pass@lain.bgm.tv/image.png"
  ]) {
    assert.equal(allowedBangumiImageUrl(blocked), null);
  }
  console.log("PASS  Cosplan dimensions, asset tokens, and Bangumi host restrictions");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "photo-cosplan-"));
  process.env.PHOTOS_DIR = root;
  try {
    const input = path.join(root, "transparent.png");
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 180, g: 40, b: 100, alpha: 0.4 }
      }
    }).png().toFile(input);

    const stored = await storeCosplanTemplate(input, 720, 900);
    const storedPath = cosplanTemplatePath(stored.token);
    assert.ok(storedPath);
    const metadata = await sharp(storedPath!).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 720);
    assert.equal(metadata.height, 900);
    assert.equal(metadata.hasAlpha, true);
    assert.ok(stored.bytes > 0);

    const foreground = await generateCosplanForeground(stored.token, 720, 900, namedSlots);
    const foregroundPath = cosplanTemplatePath(foreground.token);
    assert.ok(foregroundPath);
    const { data, info } = await sharp(foregroundPath!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    assert.equal(alphaAt(30, 50), 0);
    assert.ok(alphaAt(30, 460) > 0, "Name fields must preserve the printed background rather than cut photo openings");
    assert.ok(alphaAt(400, 500) > 0);

    const irregularForeground = await generateCosplanForeground(stored.token, 720, 900, irregularSlots);
    const irregularForegroundPath = cosplanTemplatePath(irregularForeground.token);
    assert.ok(irregularForegroundPath);
    const irregularPixels = await sharp(irregularForegroundPath!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const irregularAlphaAt = (x: number, y: number) => irregularPixels.data[(y * irregularPixels.info.width + x) * irregularPixels.info.channels + 3];
    assert.equal(irregularAlphaAt(50, 300), 0);
    assert.ok(irregularAlphaAt(200, 300) > 0);

    await deleteCosplanTemplateAssets([stored.token, foreground.token, irregularForeground.token]);
    assert.equal(await exists(storedPath!), false);
    assert.equal(await exists(foregroundPath!), false);
    console.log("PASS  template slots validate, scale, and create transparent foreground openings");

    const columnsInput = path.join(root, "slot-columns.png");
    await sharp(Buffer.from(`
      <svg width="720" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="720" height="900" fill="#302b27"/>
        <rect x="40" y="200" width="180" height="500" rx="4" fill="#f7f5ef"/>
        <rect x="270" y="200" width="180" height="500" rx="4" fill="#f7f5ef"/>
        <rect x="500" y="200" width="180" height="500" rx="4" fill="#f7f5ef"/>
      </svg>
    `)).png().toFile(columnsInput);
    const columns = await storeCosplanTemplate(columnsInput, 720, 900);
    const candidates = await detectCosplanSlotCandidates({
      assetToken: columns.token,
      color: "#f7f5ef",
      width: 720,
      height: 900,
      preset: "standard",
      inset: 4
    });
    assert.equal(candidates.length, 3);
    assert.ok(candidates.every((candidate) => candidate.quality === "recommended"));
    assert.ok(candidates[0].x + candidates[0].width < candidates[1].x);
    assert.ok(candidates[1].x + candidates[1].width < candidates[2].x);

    const irregularInput = path.join(root, "slot-irregular.png");
    await sharp(Buffer.from(`
      <svg width="720" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="720" height="900" fill="#302b27"/>
        <path d="M80 180 H620 V380 H360 V760 H80 Z" fill="#f7f5ef"/>
      </svg>
    `)).png().toFile(irregularInput);
    const irregularTemplate = await storeCosplanTemplate(irregularInput, 720, 900);
    const irregularCandidates = await detectCosplanSlotCandidates({
      assetToken: irregularTemplate.token,
      color: "#f7f5ef",
      width: 720,
      height: 900,
      preset: "standard",
      inset: 0
    });
    assert.equal(irregularCandidates.length, 1);
    assert.ok(irregularCandidates[0].shape);
    assert.ok(irregularCandidates[0].reasons.includes("irregular"));

    const whiteInput = path.join(root, "all-white.png");
    await sharp({ create: { width: 720, height: 900, channels: 4, background: "white" } }).png().toFile(whiteInput);
    const white = await storeCosplanTemplate(whiteInput, 720, 900);
    const whiteCandidates = await detectCosplanSlotCandidates({
      assetToken: white.token,
      color: "#ffffff",
      width: 720,
      height: 900,
      preset: "strict",
      inset: 4
    });
    assert.equal(whiteCandidates.length, 1);
    assert.equal(whiteCandidates[0].quality, "review");
    assert.ok(whiteCandidates[0].reasons.includes("edge"));
    assert.ok(whiteCandidates[0].reasons.includes("large"));
    await deleteCosplanTemplateAssets([columns.token, irregularTemplate.token, white.token]);
    console.log("PASS  selected-color detection separates columns, preserves irregular outlines, and flags full-page regions");

    const darkInput = path.join(root, "dark-slots.png");
    await sharp(Buffer.from(`<svg width="720" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="720" height="900" fill="#eeeeee"/>
      <rect x="40" y="200" width="180" height="500" fill="#102040"/>
      <rect x="270" y="200" width="180" height="500" fill="#203050"/>
      <rect x="500" y="200" width="180" height="500" fill="#802080"/>
    </svg>`)).png().toFile(darkInput);
    const dark = await storeCosplanTemplate(darkInput, 720, 900);
    const darkOptions = { assetToken: dark.token, width: 720, height: 900, inset: 4, color: "#102040", preset: "standard" as const };
    const darkCandidates = await detectCosplanSlotCandidates(darkOptions);
    assert.equal(darkCandidates.length, 2);
    assert.ok(darkCandidates.every((candidate) => candidate.quality === "recommended"));
    assert.equal(darkCandidates[0].x, 44);
    assert.equal(darkCandidates[0].width, 172);
    const strictDark = await detectCosplanSlotCandidates({ ...darkOptions, preset: "strict" });
    assert.equal(strictDark.length, 1);
    const purple = await detectCosplanSlotCandidates({ ...darkOptions, color: "#802080" });
    assert.equal(purple.length, 1);
    assert.equal(purple[0].x, 504, "Changing color must not reuse results cached for another color");
    assert.deepEqual(await detectCosplanSlotCandidates(darkOptions), darkCandidates);
    assert.equal((await detectCosplanSlotCandidates({ ...darkOptions, color: "#00ff00" })).length, 0);
    await assert.rejects(detectCosplanSlotCandidates({ ...darkOptions, color: "invalid" }), /invalidInput/);
    await deleteCosplanTemplateAssets([dark.token]);
    console.log("PASS  dark and saturated slot colors, match tolerance, color cache isolation, and invalid colors");

    const cacheDir = cosplanCharacterCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });
    const oldFile = path.join(cacheDir, "1.webp");
    const recentFile = path.join(cacheDir, "2.webp");
    await fs.writeFile(oldFile, Buffer.alloc(64));
    await fs.writeFile(recentFile, Buffer.alloc(64));
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await fs.utimes(oldFile, old, old);
    await trimCharacterCache(1024, 7 * 24 * 60 * 60 * 1000);
    assert.equal(await exists(oldFile), false);
    assert.equal(await exists(recentFile), true);
    await trimCharacterCache(1);
    assert.equal(await exists(recentFile), false);
    console.log("PASS  character cache removes expired files and respects its byte ceiling");
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
