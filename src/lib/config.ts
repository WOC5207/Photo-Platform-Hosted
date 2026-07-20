import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const DEFAULT_UPLOAD_MAX_MB = 100;
const DEFAULT_IMAGE_MAX_PIXELS = 100_000_000;
const DEFAULT_IMAGE_PROCESSING_CONCURRENCY = 1;
// A generous per-user ceiling on unpublished (pending) bytes. Pending photos no
// longer count against the storage quota, so this exists only to stop a runaway
// upload from filling the NAS before anything is published. 10 GB comfortably
// covers a full shoot's originals; raise PENDING_MAX_MB for larger batches.
const DEFAULT_PENDING_MAX_MB = 10 * 1024;
// How long a background-compression claim is trusted before the startup sweep
// treats it as abandoned (worker crashed mid-compress) and reclaims the row.
const DEFAULT_COMPRESSION_CLAIM_STALE_MS = 10 * 60 * 1000;

function positiveMb(name: string, fallback: number): number {
  const configured = Number(process.env[name] ?? fallback);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const config = {
  photosDir: () => path.resolve(required("PHOTOS_DIR")),
  sessionSecret: () => required("SESSION_SECRET"),
  appBaseUrl: () => required("APP_BASE_URL").replace(/\/+$/, ""),
  adminUsername: () => process.env.ADMIN_USERNAME ?? "",
  adminPassword: () => process.env.ADMIN_PASSWORD ?? "",
  stripOriginalExif: () => process.env.STRIP_ORIGINAL_EXIF === "true",
  uploadMaxBytes: () =>
    Math.floor(positiveMb("UPLOAD_MAX_MB", DEFAULT_UPLOAD_MAX_MB) * 1024 * 1024),
  pendingMaxBytes: () =>
    Math.floor(positiveMb("PENDING_MAX_MB", DEFAULT_PENDING_MAX_MB) * 1024 * 1024),
  compressionClaimStaleMs: () =>
    positiveInt("COMPRESSION_CLAIM_STALE_MS", DEFAULT_COMPRESSION_CLAIM_STALE_MS),
  imageMaxPixels: () => positiveInt("IMAGE_MAX_PIXELS", DEFAULT_IMAGE_MAX_PIXELS),
  imageProcessingConcurrency: () =>
    positiveInt("IMAGE_PROCESSING_CONCURRENCY", DEFAULT_IMAGE_PROCESSING_CONCURRENCY),
  trustedProxyHops: () => positiveInt("TRUSTED_PROXY_HOPS", 1)
};
