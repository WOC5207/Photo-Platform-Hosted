import "server-only";
import { isIP } from "node:net";
import { config } from "./config";

/**
 * Resolve the client address from a proxy-appended X-Forwarded-For chain.
 * Synology DSM is one trusted hop by default, so the rightmost address is the
 * real peer it observed rather than a caller-controlled leftmost value.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!forwarded?.length) return "unknown";
  const index = Math.max(0, forwarded.length - config.trustedProxyHops());
  const candidate = forwarded[index];
  warnIfCdnUncounted(headers, candidate);
  return candidate && candidate.length <= 64 && isIP(candidate)
    ? candidate
    : "unknown";
}

let warnedCdn = false;

/**
 * A CDN in front of DSM is one more hop. Left uncounted, every visitor's
 * address resolves to the CDN's edge, so all of them share one rate-limit
 * bucket and lock each other out of signing in and booking. Cloudflare names
 * the visitor in CF-Connecting-IP; when that differs from the address picked
 * here, say once which setting to change. The header is only compared, never
 * trusted: anyone reaching DSM directly can send it.
 */
function warnIfCdnUncounted(headers: Headers, candidate: string | undefined): void {
  if (warnedCdn) return;
  const visitor = headers.get("cf-connecting-ip")?.trim();
  if (!visitor || !candidate || visitor === candidate) return;
  warnedCdn = true;
  console.warn(
    `[clientIp] Requests arrive through Cloudflare, but TRUSTED_PROXY_HOPS=${config.trustedProxyHops()} ` +
      "resolves them to the proxy's address, so visitors share one rate limit. " +
      "If Cloudflare proxies into DSM, set TRUSTED_PROXY_HOPS=2."
  );
}
