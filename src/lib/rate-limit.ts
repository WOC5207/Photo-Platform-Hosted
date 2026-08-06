import "server-only";

/**
 * Minimal in-memory sliding-window rate limiter. Fine for a single-container
 * deployment (state resets on restart, which is acceptable for anti-abuse).
 */
interface Bucket {
  hits: number[];
  expiresAt: number;
}

const MAX_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.expiresAt <= now) buckets.delete(bucketKey);
    }
    lastCleanupAt = now;
  }

  const existing = buckets.get(key);
  const hits = (existing?.hits ?? []).filter((timestamp) => timestamp > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, {
      hits,
      expiresAt: hits[hits.length - 1] + windowMs
    });
    return false; // rejected
  }

  // Fail closed for previously unseen identities once the bounded store is
  // full. Existing callers continue to be checked, and expired buckets are
  // removed by the throttled cleanup above.
  if (!existing && buckets.size >= MAX_BUCKETS) return false;

  hits.push(now);
  buckets.set(key, { hits, expiresAt: now + windowMs });
  return true; // allowed
}
