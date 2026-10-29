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
    value: [
      // Everything not named below loads from this origin only, so injected
      // markup can neither pull in nor send data to another host.
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      // Scripts only from this origin. Inline scripts stay allowed because
      // Next streams its page data in them and a per-request nonce would make
      // every page dynamic; this still blocks injected <script src> from
      // anywhere else. Dev mode needs eval for fast refresh.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      // React's style props and Next's injected styles are inline.
      "style-src 'self' 'unsafe-inline'",
      // Upload previews, canvas exports and QR codes are blob: or data:
      // images; Cosplan's character search shows Bangumi's own thumbnails.
      "img-src 'self' data: blob: https://lain.bgm.tv",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      // Same-origin API calls; dev mode's fast refresh needs its websocket.
      `connect-src 'self'${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}`,
      // The QR label printer writes its pages into a same-origin iframe.
      "frame-src 'self' blob:",
      // The equipment QR scanner runs its decoder in a blob: worker.
      "worker-src 'self' blob:",
      "manifest-src 'self'"
    ].join("; ")
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
