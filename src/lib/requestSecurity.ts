import "server-only";
import { config } from "@/lib/config";

function requestOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(config.appBaseUrl()).origin);
  } catch {}
  if (process.env.NODE_ENV !== "production") {
    try {
      origins.add(new URL(request.url).origin);
    } catch {}
  }
  return origins;
}

/**
 * Protect cookie-authenticated Route Handlers from CSRF, including requests
 * originating on an untrusted sibling subdomain (which SameSite=Lax permits).
 * Browser-facing cookie mutations require an Origin or Referer. Trusted scripts
 * should send the configured APP_BASE_URL origin explicitly as well.
 */
export function isTrustedMutationOrigin(request: Request): boolean {
  const allowed = requestOrigins(request);
  const source =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (source) {
    try {
      return allowed.has(new URL(source).origin);
    } catch {
      return false;
    }
  }

  return false;
}
