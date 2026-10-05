import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { SITE_MODE_COOKIE, THREE_D_ROOT } from "./lib/siteMode";

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
  // A visitor who chose the 3D site lands on it from the homepage, and a
  // photographer who did lands in the 3D login, Dashboard and first-run
  // setup. Only those bare entry pages move, so every other classic page
  // (and the switch back to classic) still opens. The target is built from
  // the Host header for the same bind-address reason as above.
  const entry = /^\/(zh|en)(\/login|\/dashboard|\/dashboard\/setup)?\/?$/.exec(req.nextUrl.pathname);
  if (entry && host && req.cookies.get(SITE_MODE_COOKIE)?.value === "3d") {
    const twin = { "": "", "/login": "/login", "/dashboard": "/studio", "/dashboard/setup": "/studio/setup" }[entry[2] ?? ""];
    const target = new URL(
      `/${entry[1]}${THREE_D_ROOT}${twin}${req.nextUrl.search}`,
      `${proto === "https" ? "https" : "http"}://${host}`
    );
    return NextResponse.redirect(target, 307);
  }
  return intlMiddleware(req);
}

export const config = {
  // Skip API routes, Next internals, and files with an extension.
  //
  // API routes must stay out of the matcher. Whenever middleware runs, Next.js
  // clones the request body for it and caps that clone at
  // `experimental.middlewareClientMaxBodySize` (10 MB by default); the route
  // handler then receives a truncated body. With /api matched, every photo
  // upload above 10 MB failed with a generic bad-request error even though
  // `UPLOAD_MAX_MB` allows 100 MB. Left unmatched, uploads stream straight to
  // the handler's bounded temporary file instead of being buffered by Next.js.
  matcher: ["/((?!api|_next|.*\\..*).*)"]
};
