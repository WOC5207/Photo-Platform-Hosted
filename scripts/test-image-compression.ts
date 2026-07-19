import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  deletePhotoAssetFile,
  deletePhotoFiles,
  eventDir,
  finalizePendingMaster,
  processAndStorePendingPhoto,
  replacePendingCandidate,
  resolveUploadExtension
} from "../src/lib/images";

async function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(() => true).catch(() => false);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "photo-compression-"));
  process.env.PHOTOS_DIR = root;
  const ownerId = "compression-owner";
  const eventId = "compression-event";

  try {
    const jpeg = await sharp({
      create: {
        width: 5000,
        height: 3300,
        channels: 3,
        background: { r: 68, g: 112, b: 176 }
      }
    })
      .jpeg({ quality: 96 })
      .withMetadata({ orientation: 1 })
      .toBuffer();
    const original = await processAndStorePendingPhoto(
      ownerId,
      eventId,
      "a".repeat(32),
      jpeg,
      "jpg",
      "original"
    );
    const dir = eventDir(ownerId, eventId);
    assert.deepEqual(
      await fs.readFile(path.join(dir, original.sourceFilename)),
      jpeg,
      "the pending source must remain byte-identical"
    );
    const candidateMeta = await sharp(
      path.join(dir, original.origFilename)
    ).metadata();
    assert.equal(candidateMeta.format, "jpeg");
    assert.equal(Math.max(candidateMeta.width ?? 0, candidateMeta.height ?? 0), 4096);
    assert.equal(candidateMeta.exif, undefined, "optimized masters must strip EXIF");
    assert.ok(candidateMeta.icc, "optimized masters should carry an sRGB profile");
    assert.equal(
      original.bytes,
      original.sourceBytes + original.candidateBytes + original.renditionBytes
    );

    const finalizedOriginal = await finalizePendingMaster(
      ownerId,
      eventId,
      "a".repeat(32),
      {
        filename: original.origFilename,
        bytes: original.bytes,
        storagePreset: "original",
        sourceFilename: original.sourceFilename,
        sourceBytes: original.sourceBytes,
        candidateBytes: original.candidateBytes,
        renditionBytes: original.renditionBytes
      }
    );
    assert.equal(finalizedOriginal.filename, `${"a".repeat(32)}-orig.jpg`);
    assert.deepEqual(await fs.readFile(path.join(dir, finalizedOriginal.filename)), jpeg);
    assert.equal(
      finalizedOriginal.bytes,
      original.sourceBytes + original.renditionBytes
    );

    const transparent = await sharp({
      create: {
        width: 5000,
        height: 3000,
        channels: 4,
        background: { r: 180, g: 45, b: 120, alpha: 0.45 }
      }
    })
      .png()
      .toBuffer();
    const archive = await processAndStorePendingPhoto(
      ownerId,
      eventId,
      "b".repeat(32),
      transparent,
      "png",
      "archive"
    );
    const archiveMeta = await sharp(path.join(dir, archive.origFilename)).metadata();
    assert.equal(archiveMeta.format, "webp");
    assert.equal(archiveMeta.hasAlpha, true);
    assert.equal(Math.max(archiveMeta.width ?? 0, archiveMeta.height ?? 0), 5000);

    const balanced = await replacePendingCandidate(
      ownerId,
      eventId,
      "b".repeat(32),
      archive.sourceFilename,
      "balanced"
    );
    const balancedMeta = await sharp(path.join(dir, balanced.filename)).metadata();
    assert.equal(balancedMeta.format, "webp");
    assert.equal(balancedMeta.hasAlpha, true);
    assert.equal(Math.max(balancedMeta.width ?? 0, balancedMeta.height ?? 0), 4096);
    await deletePhotoAssetFile(ownerId, eventId, archive.origFilename);

    const finalizedBalanced = await finalizePendingMaster(
      ownerId,
      eventId,
      "b".repeat(32),
      {
        filename: balanced.filename,
        bytes: archive.sourceBytes + balanced.bytes + archive.renditionBytes,
        storagePreset: "balanced",
        sourceFilename: archive.sourceFilename,
        sourceBytes: archive.sourceBytes,
        candidateBytes: balanced.bytes,
        renditionBytes: archive.renditionBytes
      }
    );
    assert.match(finalizedBalanced.filename, /-orig\.webp$/);
    assert.equal(await exists(path.join(dir, archive.sourceFilename)), false);
    assert.equal(
      finalizedBalanced.bytes,
      balanced.bytes + archive.renditionBytes
    );

    assert.equal(
      resolveUploadExtension({ type: "image/tiff", name: "photo.tiff" }),
      "tif"
    );
    assert.equal(
      resolveUploadExtension({ type: "image/x-tiff", name: "photo.tif" }),
      "tif"
    );
    assert.equal(
      resolveUploadExtension({ type: "application/octet-stream", name: "photo.tiff" }),
      "tif"
    );
    assert.equal(
      resolveUploadExtension({ type: "application/octet-stream", name: "photo.jpg" }),
      null
    );

    const tiff = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 40, g: 130, b: 90 }
      }
    })
      .tiff({ compression: "lzw" })
      .toBuffer();
    const tiffId = "c".repeat(32);
    const pendingTiff = await processAndStorePendingPhoto(
      ownerId,
      eventId,
      tiffId,
      tiff,
      "tif",
      "original"
    );
    assert.deepEqual(
      await fs.readFile(path.join(dir, pendingTiff.sourceFilename)),
      tiff,
      "an Original TIFF source must remain byte-identical"
    );
    assert.equal(
      (await sharp(path.join(dir, pendingTiff.origFilename)).metadata()).format,
      "jpeg",
      "the TIFF comparison candidate should use the normal opaque JPEG master"
    );
    for (const suffix of ["thumb", "med", "full"]) {
      assert.equal(await exists(path.join(dir, `${tiffId}-${suffix}.webp`)), true);
    }
    const finalizedTiff = await finalizePendingMaster(
      ownerId,
      eventId,
      tiffId,
      {
        filename: pendingTiff.origFilename,
        bytes: pendingTiff.bytes,
        storagePreset: "original",
        sourceFilename: pendingTiff.sourceFilename,
        sourceBytes: pendingTiff.sourceBytes,
        candidateBytes: pendingTiff.candidateBytes,
        renditionBytes: pendingTiff.renditionBytes
      }
    );
    assert.equal(finalizedTiff.filename, `${tiffId}-orig.tif`);
    assert.deepEqual(await fs.readFile(path.join(dir, finalizedTiff.filename)), tiff);

    const pathInputId = "d".repeat(32);
    const pathInput = path.join(root, "camera-original.jpg");
    await fs.writeFile(pathInput, jpeg);
    const pendingFromPath = await processAndStorePendingPhoto(
      ownerId,
      eventId,
      pathInputId,
      pathInput,
      "jpg",
      "original"
    );
    const finalizedFromPath = await finalizePendingMaster(
      ownerId,
      eventId,
      pathInputId,
      {
        filename: pendingFromPath.origFilename,
        bytes: pendingFromPath.bytes,
        storagePreset: "original",
        sourceFilename: pendingFromPath.sourceFilename,
        sourceBytes: pendingFromPath.sourceBytes,
        candidateBytes: pendingFromPath.candidateBytes,
        renditionBytes: pendingFromPath.renditionBytes
      }
    );
    assert.deepEqual(
      await fs.readFile(path.join(dir, finalizedFromPath.filename)),
      jpeg,
      "streamed file-path input must preserve Original bytes exactly"
    );

    const pixelBomb = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: { r: 1, g: 2, b: 3 }
      }
    }).png().toBuffer();
    process.env.IMAGE_MAX_PIXELS = "100";
    await assert.rejects(
      processAndStorePendingPhoto(
        ownerId,
        eventId,
        "e".repeat(32),
        pixelBomb,
        "png",
        "balanced"
      ),
      /pixel|limit|input/i,
      "decoded images above IMAGE_MAX_PIXELS must be rejected"
    );
    delete process.env.IMAGE_MAX_PIXELS;

    await deletePhotoFiles(
      ownerId,
      eventId,
      "a".repeat(32),
      finalizedOriginal.filename
    );
    await deletePhotoFiles(
      ownerId,
      eventId,
      "b".repeat(32),
      finalizedBalanced.filename
    );
    await deletePhotoFiles(ownerId, eventId, tiffId, finalizedTiff.filename);
    await deletePhotoFiles(ownerId, eventId, pathInputId, finalizedFromPath.filename);
    console.log("✓ pending image compression, comparison and finalization");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
