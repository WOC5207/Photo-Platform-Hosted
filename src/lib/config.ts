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
const DEFAULT_MODERATION_CLAIM_STALE_MS = 5 * 60 * 1000;
const DEFAULT_MODERATION_CONCURRENCY = 2;
const DEFAULT_MODERATION_MAX_ATTEMPTS = 4;

function positiveMb(name: string, fallback: number): number {
  const configured = Number(process.env[name] ?? fallback);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// SMTP transport settings for outbound email. Every field is optional: mail is
// a bonus, not a requirement, so an unconfigured deploy simply sends nothing
// (see isMailConfigured / src/lib/mailer.ts) rather than failing to boot.
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  // SMTP over implicit TLS (port 465). Most providers on 587 use STARTTLS and
  // want this false; nodemailer negotiates STARTTLS automatically.
  secure: boolean;
}

function smtp(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST ?? "",
    port: positiveInt("SMTP_PORT", 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    // Fall back to SMTP_USER so a provider that requires From == authenticated
    // user works with only the credentials set.
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
    secure: process.env.SMTP_SECURE === "true"
  };
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
  moderationClaimStaleMs: () =>
    positiveInt("MODERATION_CLAIM_STALE_MS", DEFAULT_MODERATION_CLAIM_STALE_MS),
  moderationConcurrency: () =>
    positiveInt("MODERATION_CONCURRENCY", DEFAULT_MODERATION_CONCURRENCY),
  moderationMaxAttempts: () =>
    positiveInt("MODERATION_MAX_ATTEMPTS", DEFAULT_MODERATION_MAX_ATTEMPTS),
  openAiApiKey: () => process.env.OPENAI_API_KEY?.trim() ?? "",
  isOpenAIConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  imageMaxPixels: () => positiveInt("IMAGE_MAX_PIXELS", DEFAULT_IMAGE_MAX_PIXELS),
  imageProcessingConcurrency: () =>
    positiveInt("IMAGE_PROCESSING_CONCURRENCY", DEFAULT_IMAGE_PROCESSING_CONCURRENCY),
  trustedProxyHops: () => positiveInt("TRUSTED_PROXY_HOPS", 1),
  smtp,
  // Email is only attempted when there is somewhere to send from and a server
  // to send through. Anything short of that is a deliberate no-op, so the
  // platform runs identically to before on deploys that never set SMTP_*.
  isMailConfigured: () => {
    const s = smtp();
    return s.host !== "" && s.from !== "";
  }
};
