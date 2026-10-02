import "server-only";

/**
 * A small in-process TTL cache with a hard entry cap and tag invalidation.
 *
 * Used instead of Next's unstable_cache for lookups keyed on public URL
 * segments (image paths, usernames). unstable_cache writes every entry,
 * including misses, to .next/cache on disk and never deletes expired ones, so
 * anonymous requests for made-up URLs would grow the container's disk without
 * bound. This cache lives in memory, evicts the least recently used entry once
 * full, and is cleared by invalidatePublicMedia like the tags it replaces.
 */
interface Entry<T> {
  value: Promise<T>;
  expiresAt: number;
  tags: string[];
}

interface BoundedCache {
  invalidate(tags: Set<string>): void;
}

const registry = new Set<BoundedCache>();

export function createBoundedCache<T>({
  maxEntries,
  ttlMs
}: {
  maxEntries: number;
  ttlMs: number;
}) {
  const entries = new Map<string, Entry<T>>();

  const cache: BoundedCache = {
    invalidate(tags) {
      for (const [key, entry] of entries) {
        if (entry.tags.some((tag) => tags.has(tag))) entries.delete(key);
      }
    }
  };
  registry.add(cache);

  return function cached(
    keyParts: string[],
    tags: string[],
    load: () => Promise<T>
  ): Promise<T> {
    const key = JSON.stringify(keyParts);
    const now = Date.now();
    const hit = entries.get(key);
    entries.delete(key);
    if (hit && hit.expiresAt > now) {
      entries.set(key, hit); // most recently used goes last
      return hit.value;
    }

    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }

    const value = load();
    const entry = { value, expiresAt: now + ttlMs, tags };
    entries.set(key, entry);
    // A failed load must not be served from cache.
    value.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return value;
  };
}

/** Drops every entry, in every bounded cache, carrying any of `tags`. */
export function invalidateBoundedCaches(tags: string[]): void {
  const set = new Set(tags);
  for (const cache of registry) cache.invalidate(set);
}
