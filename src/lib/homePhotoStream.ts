import "server-only";
import { prisma } from "@/lib/db";
import { pickText, formatCredits } from "@/lib/content";
import { formatDateRange } from "@/lib/datetime";
import { photoUrls } from "@/lib/images";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import type {
  HomePhotoStreamPage,
  StreamEvent
} from "@/lib/homePhotoStreamTypes";

export const HOME_PHOTO_STREAM_PAGE_SIZE = 24;

/**
 * Fetch one stable slice of a photographer's public homepage archive.
 *
 * Photos are ordered by album recency first and the photographer's gallery
 * order second. The photo id is the final tie-breaker, so cursor pagination
 * never repeats a row when dates or sort positions match. A page may end in
 * the middle of an album; the client merges that continuation into the album
 * already on screen.
 */
export async function getHomePhotoStreamPage({
  ownerId,
  locale,
  cursor,
  pageSize = HOME_PHOTO_STREAM_PAGE_SIZE
}: {
  ownerId: string;
  locale: string;
  cursor?: string | null;
  pageSize?: number;
}): Promise<HomePhotoStreamPage> {
  const take = Math.max(1, Math.min(pageSize, 48));
  const photos = await prisma.photo.findMany({
    where: {
      ...publicPhotoWhere,
      event: { ownerId, published: true }
    },
    orderBy: [
      { event: { dateStart: "desc" } },
      { event: { createdAt: "desc" } },
      { event: { id: "desc" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
      { id: "asc" }
    ],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: take + 1,
    select: {
      id: true,
      eventId: true,
      width: true,
      height: true,
      homeWeight: true,
      event: {
        select: {
          slug: true,
          titleEn: true,
          titleZh: true,
          dateStart: true,
          dateEnd: true,
          location: true
        }
      },
      credits: {
        orderBy: { sortOrder: "asc" },
        select: { creditName: true, subject: true }
      }
    }
  });

  const pagePhotos = photos.slice(0, take);
  const events: StreamEvent[] = [];
  const eventIndexes = new Map<string, number>();

  for (const photo of pagePhotos) {
    let eventIndex = eventIndexes.get(photo.eventId);
    if (eventIndex === undefined) {
      eventIndex = events.length;
      eventIndexes.set(photo.eventId, eventIndex);
      events.push({
        slug: photo.event.slug,
        title: pickText(locale, photo.event.titleEn, photo.event.titleZh),
        date: formatDateRange(photo.event.dateStart, photo.event.dateEnd) || null,
        location: photo.event.location,
        photos: []
      });
    }

    events[eventIndex].photos.push({
      id: photo.id,
      url: photoUrls(photo.eventId, photo.id).med,
      alt: formatCredits(photo.credits),
      width: photo.width,
      height: photo.height,
      homeWeight: photo.homeWeight
    });
  }

  return {
    events,
    nextCursor:
      photos.length > take && pagePhotos.length > 0
        ? pagePhotos[pagePhotos.length - 1].id
        : null
  };
}
