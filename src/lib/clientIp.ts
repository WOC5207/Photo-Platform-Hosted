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
  return candidate && candidate.length <= 64 && isIP(candidate)
    ? candidate
    : "unknown";
}
