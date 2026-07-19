import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const DEFAULT_UPLOAD_MAX_MB = 100;
const DEFAULT_IMAGE_MAX_PIXELS = 100_000_000;
const DEFAULT_IMAGE_PROCESSING_CONCURRENCY = 1;

function uploadMaxMb(): number {
  const configured = Number(process.env.UPLOAD_MAX_MB ?? DEFAULT_UPLOAD_MAX_MB);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_UPLOAD_MAX_MB;
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
  uploadMaxBytes: () => Math.floor(uploadMaxMb() * 1024 * 1024),
  imageMaxPixels: () => positiveInt("IMAGE_MAX_PIXELS", DEFAULT_IMAGE_MAX_PIXELS),
  imageProcessingConcurrency: () =>
    positiveInt("IMAGE_PROCESSING_CONCURRENCY", DEFAULT_IMAGE_PROCESSING_CONCURRENCY),
  trustedProxyHops: () => positiveInt("TRUSTED_PROXY_HOPS", 1)
};
