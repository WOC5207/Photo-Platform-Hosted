import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(), usb=()"
  },
  {
    key: "Content-Security-Policy",
    value:
      "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'"
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Standalone output (with its file-tracing .nft.json files) is only needed
  // to build the small Docker runtime image — the Dockerfile sets
  // NEXT_STANDALONE=1. Enabling it locally breaks `next dev`/`next start` on
  // Windows when the project lives in OneDrive: OneDrive gives files
  // reparse-point attributes and Node's readlink() then throws EINVAL on the
  // traced files. So only turn it on for the Docker build.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  serverExternalPackages: ["sharp"],
  // Images are pre-optimized at upload time with sharp and served from the
  // photos volume; the built-in optimizer would re-encode per request (too
  // memory-heavy for a NAS).
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default withNextIntl(nextConfig);
