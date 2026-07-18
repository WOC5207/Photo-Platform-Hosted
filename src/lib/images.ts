import "server-only";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import sharp from "sharp";
import exifr from "exifr";
import { config } from "./config";

// Keep sharp's appetite modest on NAS hardware.
sharp.concurrency(2);
sharp.cache(false);

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/tiff": "tif",
  "image/x-tiff": "tif"
};

export function resolveUploadExtension(file: {
  type: string;
  name: string;
}): string | null {
  const mimeExtension = ALLOWED_UPLOAD_TYPES[file.type.toLowerCase()];
  if (mimeExtension) return mimeExtension;

  // Some Windows/browser combinations do not provide a TIFF MIME type. Only
  // use the filename fallback for an absent/generic MIME; Sharp still parses
  // the bytes before anything is published.
  const mime = file.type.toLowerCase();
  const filenameExtension = path.extname(file.name).toLowerCase();
  if (
    (mime === "" || mime === "application/octet-stream") &&
    (filenameExtension === ".tif" || filenameExtension === ".tiff")
  ) {
    return "tif";
  }
  return null;
}

// Generated web sizes. sharp strips ALL metadata (EXIF/GPS/etc.) by default
// on output, which is exactly what we want for displayed images.
const SIZES = [
  { suffix: "thumb", width: 480, quality: 70 },
  { suffix: "med", width: 1280, quality: 80 },
  { suffix: "full", width: 2560, quality: 85 }
] as const;

export type StoragePreset = "original" | "archive" | "balanced";
export type CandidatePreset = Exclude<StoragePreset, "original">;

export const STORAGE_PRESETS: readonly StoragePreset[] = [
  "original",
  "archive",
  "balanced"
];

const CANDIDATE_OPTIONS: Record<
  CandidatePreset,
  { maxEdge: number; quality: number }
> = {
  archive: { maxEdge: 6000, quality: 92 },
  balanced: { maxEdge: 4096, quality: 88 }
};

export function isStoragePreset(value: unknown): value is StoragePreset {
  return typeof value === "string" && STORAGE_PRESETS.includes(value as StoragePreset);
}

/**
 * Storage is keyed by owner id, never username: usernames are renameable, and a
 * rename must not mean moving files or rewriting URLs.
 *
 * Note the served URLs deliberately do NOT carry the owner — the serving routes
 * look it up from the row instead. That keeps URLs stable across a rename and
 * removes any chance of the path's owner disagreeing with the record's.
 */
export function userDir(ownerId: string): string {
  return path.join(config.photosDir(), "u", ownerId);
}

export function eventDir(ownerId: string, eventId: string): string {
  return path.join(userDir(ownerId), eventId);
}

export interface ProcessedUpload {
  width: number;
  height: number;
  origFilename: string;
  exif: PhotoExif;
  /** Total bytes written: the original plus all three renditions. */
  bytes: number;
}

export interface ProcessedPendingUpload extends ProcessedUpload {
  storagePreset: StoragePreset;
  candidatePreset: CandidatePreset;
  sourceFilename: string;
  sourceBytes: number;
  candidateBytes: number;
  renditionBytes: number;
}

export interface PhotoExif {
  focalLengthMm: number | null;
  aperture: number | null;
  exposureTime: number | null;
  iso: number | null;
  takenAt: Date | null;
  cameraModel: string | null;
  lensModel: string | null;
}

/**
 * Read the shooting EXIF from the as-uploaded buffer, before any of our own
 * processing strips it. Best-effort: missing/unparseable EXIF just means
 * every field comes back null (e.g. screenshots, graphics, edited exports).
 */
async function extractExif(buffer: Buffer): Promise<PhotoExif> {
  const empty: PhotoExif = {
    focalLengthMm: null,
    aperture: null,
    exposureTime: null,
    iso: null,
    takenAt: null,
    cameraModel: null,
    lensModel: null
  };
  const tags = await exifr
    .parse(buffer, {
      pick: [
        "FocalLength",
        "FNumber",
        "ExposureTime",
        "ISO",
        "DateTimeOriginal",
        "Make",
        "Model",
        "LensModel"
      ]
    })
    .catch(() => null);
  if (!tags) return empty;

  const make = typeof tags.Make === "string" ? tags.Make.trim() : "";
  const model = typeof tags.Model === "string" ? tags.Model.trim() : "";
  // Many bodies repeat the make as a prefix of the model (e.g. "Canon" /
  // "Canon EOS R5"); avoid showing it twice.
  const cameraModel =
    model && (!make || model.toLowerCase().startsWith(make.toLowerCase()))
      ? model || null
      : [make, model].filter(Boolean).join(" ") || null;

  return {
    focalLengthMm: typeof tags.FocalLength === "number" ? tags.FocalLength : null,
    aperture: typeof tags.FNumber === "number" ? tags.FNumber : null,
    exposureTime:
      typeof tags.ExposureTime === "number" ? tags.ExposureTime : null,
    iso: typeof tags.ISO === "number" ? tags.ISO : null,
    takenAt: tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal : null,
    cameraModel,
    lensModel: typeof tags.LensModel === "string" ? tags.LensModel.trim() || null : null
  };
}

async function writeRenditions(
  input: Buffer | string,
  dir: string,
  photoId: string
): Promise<number> {
  let bytes = 0;
  // Sequential processing keeps peak memory predictable on NAS hardware.
  for (const size of SIZES) {
    const out = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toFile(path.join(dir, `${photoId}-${size.suffix}.webp`));
    bytes += out.size;
  }
  return bytes;
}

async function writeCandidate(
  input: Buffer | string,
  dir: string,
  photoId: string,
  preset: CandidatePreset
): Promise<{ filename: string; bytes: number }> {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");

  const { maxEdge, quality } = CANDIDATE_OPTIONS[preset];
  const ext = meta.hasAlpha ? "webp" : "jpg";
  const token = randomUUID().replace(/-/g, "");
  const filename = `${photoId}-candidate-${token}.${ext}`;
  const output = path.join(dir, filename);
  const pipeline = sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true
    })
    // Optimized masters retain predictable colour but not EXIF/GPS metadata.
    .withIccProfile("srgb");

  try {
    const out = meta.hasAlpha
      ? await pipeline
          .webp({
            quality,
            alphaQuality: 100,
            effort: 4,
            preset: "photo",
            smartSubsample: true
          })
          .toFile(output)
      : await pipeline
          .jpeg({ quality, progressive: true, mozjpeg: true })
          .toFile(output);
    return { filename, bytes: out.size };
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Store an exact source, one compressed comparison candidate and the public
 * renditions. Neither master receives the stable -orig name until Create, so
 * pending files cannot accidentally become addressable through the image API.
 */
export async function processAndStorePendingPhoto(
  ownerId: string,
  eventId: string,
  photoId: string,
  buffer: Buffer,
  ext: string,
  storagePreset: StoragePreset
): Promise<ProcessedPendingUpload> {
  const dir = eventDir(ownerId, eventId);
  await fs.mkdir(dir, { recursive: true });

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;
  const exif = await extractExif(buffer);
  const sourceFilename = `${photoId}-source.${ext}`;
  const candidatePreset =
    storagePreset === "original" ? "balanced" : storagePreset;

  try {
    await fs.writeFile(path.join(dir, sourceFilename), buffer);
    const renditionBytes = await writeRenditions(buffer, dir, photoId);
    const candidate = await writeCandidate(
      buffer,
      dir,
      photoId,
      candidatePreset
    );
    const sourceBytes = buffer.length;
    const bytes = sourceBytes + candidate.bytes + renditionBytes;
    return {
      width,
      height,
      origFilename: candidate.filename,
      exif,
      bytes,
      storagePreset,
      candidatePreset,
      sourceFilename,
      sourceBytes,
      candidateBytes: candidate.bytes,
      renditionBytes
    };
  } catch (error) {
    await deletePhotoFiles(ownerId, eventId, photoId, sourceFilename).catch(
      () => undefined
    );
    throw error;
  }
}

export async function replacePendingCandidate(
  ownerId: string,
  eventId: string,
  photoId: string,
  sourceFilename: string,
  preset: CandidatePreset
): Promise<{ filename: string; bytes: number }> {
  return writeCandidate(
    path.join(eventDir(ownerId, eventId), sourceFilename),
    eventDir(ownerId, eventId),
    photoId,
    preset
  );
}

export async function deletePhotoAssetFile(
  ownerId: string,
  eventId: string,
  filename: string
): Promise<void> {
  if (!filename || path.basename(filename) !== filename) {
    throw new Error("Invalid photo filename");
  }
  await fs.rm(path.join(eventDir(ownerId, eventId), filename), { force: true });
}

export async function finalizePendingMaster(
  ownerId: string,
  eventId: string,
  photoId: string,
  input: {
    filename: string;
    bytes: number;
    storagePreset: StoragePreset;
    sourceFilename: string | null;
    sourceBytes: number | null;
    candidateBytes: number | null;
    renditionBytes: number | null;
  }
): Promise<{ filename: string; bytes: number }> {
  // A pre-migration pending upload already owns its stable original and can be
  // finalized exactly as before without touching its files.
  if (
    !input.sourceFilename ||
    input.sourceBytes == null ||
    input.candidateBytes == null ||
    input.renditionBytes == null
  ) {
    return { filename: input.filename, bytes: input.bytes };
  }

  const dir = eventDir(ownerId, eventId);
  const chosen =
    input.storagePreset === "original" ? input.sourceFilename : input.filename;
  const discarded =
    input.storagePreset === "original" ? input.filename : input.sourceFilename;
  const finalFilename = `${photoId}-orig${path.extname(chosen)}`;
  const chosenPath = path.join(dir, chosen);
  const finalPath = path.join(dir, finalFilename);

  // A retry after the rename is harmless: the stable file is the durable sign
  // that the filesystem phase completed even if the database response was lost.
  const finalExists = await fs.stat(finalPath).then(() => true).catch(() => false);
  if (!finalExists && chosen !== finalFilename) {
    await fs.rename(chosenPath, finalPath);
  }
  if (discarded !== finalFilename) {
    await fs.rm(path.join(dir, discarded), { force: true });
  }
  const siblings = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    siblings
      .filter(
        (name) =>
          name !== finalFilename &&
          (name.startsWith(`${photoId}-candidate-`) ||
            name.startsWith(`${photoId}-source.`))
      )
      .map((name) => fs.rm(path.join(dir, name), { force: true }))
  );

  return {
    filename: finalFilename,
    bytes:
      (input.storagePreset === "original"
        ? input.sourceBytes
        : input.candidateBytes) + input.renditionBytes
  };
}

/**
 * Writes the original plus thumb/med/full webp renditions for a photo.
 * Returns the display dimensions (after EXIF orientation is applied) and the
 * shooting EXIF read from the original before it's stripped.
 */
export async function processAndStorePhoto(
  ownerId: string,
  eventId: string,
  photoId: string,
  buffer: Buffer,
  ext: string
): Promise<ProcessedUpload> {
  const dir = eventDir(ownerId, eventId);
  await fs.mkdir(dir, { recursive: true });

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;
  const exif = await extractExif(buffer);

  await writeRenditions(buffer, dir, photoId);

  const origFilename = `${photoId}-orig.${ext}`;
  const origPath = path.join(dir, origFilename);
  if (config.stripOriginalExif()) {
    // Re-encode (high quality) to drop EXIF from the stored original too.
    const pipeline = sharp(buffer, { failOn: "none" }).rotate();
    if (ext === "png") await pipeline.png().toFile(origPath);
    else if (ext === "webp")
      await pipeline.webp({ quality: 95 }).toFile(origPath);
    else if (ext === "tif" || ext === "tiff")
      await pipeline.tiff({ compression: "lzw" }).toFile(origPath);
    else await pipeline.jpeg({ quality: 95, mozjpeg: true }).toFile(origPath);
  } else {
    await fs.writeFile(origPath, buffer);
  }

  // Measured rather than estimated, and measured here because this is the only
  // place that knows what was actually written — webp compression means the
  // renditions bear no fixed relation to the upload's size.
  const written = [
    origPath,
    ...SIZES.map((size) => path.join(dir, `${photoId}-${size.suffix}.webp`))
  ];
  const sizes = await Promise.all(
    written.map((f) => fs.stat(f).then((st) => st.size).catch(() => 0))
  );
  const bytes = sizes.reduce((sum, n) => sum + n, 0);

  return { width, height, origFilename, exif, bytes };
}

export async function deletePhotoFiles(
  ownerId: string,
  eventId: string,
  photoId: string,
  origFilename: string
): Promise<void> {
  const dir = eventDir(ownerId, eventId);
  // Include versioned candidates and temporary sources left by interrupted
  // pending operations. The exact photo-id prefix keeps cleanup tenant/event
  // scoped and cannot match a neighbouring photo.
  const siblings = await fs.readdir(dir).catch(() => [] as string[]);
  const files = Array.from(
    new Set([
      origFilename,
      ...SIZES.map((s) => `${photoId}-${s.suffix}.webp`),
      ...siblings.filter((name) => name.startsWith(`${photoId}-`))
    ])
  );
  await Promise.all(
    files.map((f) => fs.rm(path.join(dir, f), { force: true }))
  );
}

export async function deleteEventFiles(
  ownerId: string,
  eventId: string
): Promise<void> {
  await fs.rm(eventDir(ownerId, eventId), { recursive: true, force: true });
}

/**
 * Everything one account has on disk. For account deletion, which must remove
 * the files BEFORE the row: the row is how the paths are found, so deleting it
 * first orphans the files permanently.
 */
export async function deleteUserFiles(ownerId: string): Promise<void> {
  await fs.rm(userDir(ownerId), { recursive: true, force: true });
}

export function photoUrls(eventId: string, photoId: string) {
  const base = `/api/images/${eventId}/${photoId}`;
  return {
    thumb: `${base}-thumb.webp`,
    med: `${base}-med.webp`,
    full: `${base}-full.webp`
  };
}

// --- Site-level images (background, logo) -------------------------------
// Not tied to a gallery event; they live under a per-owner "_site" folder (the
// leading underscore keeps them out of the event-image route, whose eventId
// must match /^[a-z0-9]+$/).

export function siteDir(ownerId: string): string {
  return path.join(userDir(ownerId), "_site");
}

export interface SiteImageOptions {
  // Filename prefix (also part of the served URL token), e.g. "bg" or "logo".
  prefix: string;
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

/**
 * Store an uploaded site image (background, logo, …) as a single webp with all
 * metadata stripped. Returns a fresh token; the file is
 * <PHOTOS_DIR>/_site/<token>.webp. A new token per upload lets the served URL
 * be cached immutably.
 */
export async function processAndStoreSiteImage(
  ownerId: string,
  buffer: Buffer,
  opts: SiteImageOptions
): Promise<{ token: string; bytes: number }> {
  const dir = siteDir(ownerId);
  await fs.mkdir(dir, { recursive: true });

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");

  const token = `${opts.prefix}${randomUUID().replace(/-/g, "")}`;
  const file = path.join(dir, `${token}.webp`);
  const out = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: opts.maxWidth,
      height: opts.maxHeight,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: opts.quality })
    .toFile(file);
  return { token, bytes: out.size };
}

export async function deleteSiteImageFile(
  ownerId: string,
  token: string
): Promise<void> {
  if (!token) return;
  await fs.rm(path.join(siteDir(ownerId), `${token}.webp`), { force: true });
}

export function siteImageUrl(token: string): string {
  return token ? `/api/site/${token}.webp` : "";
}
