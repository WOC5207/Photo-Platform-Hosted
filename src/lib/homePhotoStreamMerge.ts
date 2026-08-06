import type { StreamEvent } from "@/lib/homePhotoStreamTypes";

/** Merge a paginated continuation without duplicating an album or photograph. */
export function mergeStreamEvents(
  current: StreamEvent[],
  incoming: StreamEvent[]
): StreamEvent[] {
  const merged = current.map((event) => ({
    ...event,
    photos: [...event.photos]
  }));
  const eventIndexes = new Map(
    merged.map((event, index) => [event.slug, index] as const)
  );

  for (const event of incoming) {
    const existingIndex = eventIndexes.get(event.slug);
    if (existingIndex === undefined) {
      eventIndexes.set(event.slug, merged.length);
      merged.push({ ...event, photos: [...event.photos] });
      continue;
    }

    const existing = merged[existingIndex];
    const photoIds = new Set(existing.photos.map((photo) => photo.id));
    existing.photos.push(
      ...event.photos.filter((photo) => !photoIds.has(photo.id))
    );
  }

  return merged;
}
