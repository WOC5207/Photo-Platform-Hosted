import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Next.js always sets x-forwarded-proto on the request it hands to
// middleware — reflecting the real header from a proxy in front when one is
// set, but synthesized from the raw (always-plain-HTTP) connection when
// there's no proxy at all. So it reads "http" both for "the reverse proxy
// forwarded a plain-HTTP visitor request for photos.example.com" (should
// redirect) and for "someone hit http://<NAS-IP>:3000 directly" (must NOT
// redirect — that's how the README's first-run setup reaches the app before
// HTTPS exists).
// Only the production hostname distinguishes the two, so gate on both — and
// on APP_BASE_URL itself being an https:// origin, so this is a no-op in
// local dev (APP_BASE_URL="http://localhost:3000" there) even though the
// host would otherwise match.
function shouldForceHttps(host: string | null): boolean {
  if (!host) return false;
  try {
    const configured = new URL(process.env.APP_BASE_URL ?? "");
    return configured.protocol === "https:" && host === configured.host;
  } catch {
    return false;
  }
}

export default function middleware(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("host");
  if (proto === "http" && shouldForceHttps(host)) {
    // Built from the trusted Host header rather than req.nextUrl.clone() —
    // nextUrl.host reflects the server's own bind address here, not the
    // incoming Host header, so cloning it would redirect to the wrong host.
    const target = new URL(
      req.nextUrl.pathname + req.nextUrl.search,
      `https://${host}`
    );
    return NextResponse.redirect(target, 308);
  }
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  return intlMiddleware(req);
}

export const config = {
  // Skip API routes, Next internals, and files with an extension
  matcher: ["/api/:path*", "/((?!_next|.*\\..*).*)"]
};
