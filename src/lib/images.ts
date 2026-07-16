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
  "image/webp": "webp"
};

// Generated web sizes. sharp strips ALL metadata (EXIF/GPS/etc.) by default
// on output, which is exactly what we want for displayed images.
const SIZES = [
  { suffix: "thumb", width: 480, quality: 70 },
  { suffix: "med", width: 1280, quality: 80 },
  { suffix: "full", width: 2560, quality: 85 }
] as const;

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

  // Sequential to keep peak memory low.
  for (const size of SIZES) {
    await sharp(buffer, { failOn: "none" })
      .rotate() // apply EXIF orientation before metadata is stripped
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toFile(path.join(dir, `${photoId}-${size.suffix}.webp`));
  }

  const origFilename = `${photoId}-orig.${ext}`;
  const origPath = path.join(dir, origFilename);
  if (config.stripOriginalExif()) {
    // Re-encode (high quality) to drop EXIF from the stored original too.
    const pipeline = sharp(buffer, { failOn: "none" }).rotate();
    if (ext === "png") await pipeline.png().toFile(origPath);
    else if (ext === "webp")
      await pipeline.webp({ quality: 95 }).toFile(origPath);
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
  const files = [
    origFilename,
    ...SIZES.map((s) => `${photoId}-${s.suffix}.webp`)
  ];
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
