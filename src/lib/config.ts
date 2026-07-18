import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const DEFAULT_UPLOAD_MAX_MB = 100;

function uploadMaxMb(): number {
  const configured = Number(process.env.UPLOAD_MAX_MB ?? DEFAULT_UPLOAD_MAX_MB);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_UPLOAD_MAX_MB;
}

export const config = {
  photosDir: () => path.resolve(required("PHOTOS_DIR")),
  sessionSecret: () => required("SESSION_SECRET"),
  appBaseUrl: () => required("APP_BASE_URL").replace(/\/+$/, ""),
  adminUsername: () => process.env.ADMIN_USERNAME ?? "",
  adminPassword: () => process.env.ADMIN_PASSWORD ?? "",
  stripOriginalExif: () => process.env.STRIP_ORIGINAL_EXIF === "true",
  uploadMaxBytes: () => Math.floor(uploadMaxMb() * 1024 * 1024)
};
