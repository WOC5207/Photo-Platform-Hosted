import "server-only";

/**
 * Minimal in-memory sliding-window rate limiter. Fine for a single-container
 * deployment (state resets on restart, which is acceptable for anti-abuse).
 *
 * Buckets live in one bounded store per scope (the key's first `:` segment,
 * e.g. "login" or "book-lookup"), so floods of one kind of request can never
 * crowd out another: filling the lottery store cannot lock anyone out of
 * logging in. When a store is full, its least recently used bucket is evicted
 * instead of refusing every new caller, which would turn the cap itself into a
 * lockout anyone could trigger.
 */
interface Bucket {
  hits: number[];
  expiresAt: number;
}

export const MAX_BUCKETS_PER_SCOPE = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;
const stores = new Map<string, Map<string, Bucket>>();
let lastCleanupAt = 0;

function scopeOf(key: string): string {
  const separator = key.indexOf(":");
  return separator === -1 ? key : key.slice(0, separator);
}

function storeFor(key: string): Map<string, Bucket> {
  const scope = scopeOf(key);
  let store = stores.get(scope);
  if (!store) {
    store = new Map();
    stores.set(scope, store);
  }
  return store;
}

function cleanup(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  for (const [scope, store] of stores) {
    for (const [bucketKey, bucket] of store) {
      if (bucket.expiresAt <= now) store.delete(bucketKey);
    }
    if (store.size === 0) stores.delete(scope);
  }
  lastCleanupAt = now;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  cleanup(now);

  const store = storeFor(key);
  const existing = store.get(key);
  const hits = (existing?.hits ?? []).filter((timestamp) => timestamp > cutoff);
  // Re-inserting moves the key to the end, so Map order is least recently used
  // first and eviction below drops the stalest caller.
  store.delete(key);

  if (hits.length >= limit) {
    store.set(key, { hits, expiresAt: hits[hits.length - 1] + windowMs });
    return false; // rejected
  }

  while (store.size >= MAX_BUCKETS_PER_SCOPE) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }

  hits.push(now);
  store.set(key, { hits, expiresAt: now + windowMs });
  return true; // allowed
}
