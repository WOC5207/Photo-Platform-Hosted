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
  replacePendingCandidate
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
    console.log("✓ pending image compression, comparison and finalization");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
