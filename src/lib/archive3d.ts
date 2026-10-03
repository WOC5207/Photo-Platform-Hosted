import "server-only";
import { prisma } from "@/lib/db";
import { ownerName, ownerBasePath } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import type { ArchiveColumn, ArchiveFile } from "@/components/album3d/types";

/** Albums shown in the field. Past this the scene stops being browsable. */
const MAX_ALBUMS = 160;
/** Prints stacked in the 360° view of one album. */
const PRINTS_PER_ALBUM = 12;

/**
 * Everything the 3D site shows: the platform's published albums as files,
 * grouped into one column per photographer (in directory order, albums
 * newest first). Loaded once by the /3d layout, so moving between 3D screens
 * never asks the server for more than the image renditions themselves.
 */
export async function loadArchive(locale: string): Promise<{ files: ArchiveFile[]; columns: ArchiveColumn[] }> {
  const events = await prisma.event.findMany({
    where: {
      published: true,
      owner: { status: "active" },
      photos: { some: publicPhotoWhere }
    },
    orderBy: [
      { owner: { createdAt: "asc" } },
      { dateStart: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" }
    ],
    take: MAX_ALBUMS,
    select: {
      id: true,
      slug: true,
      titleEn: true,
      titleZh: true,
      location: true,
      dateStart: true,
      dateEnd: true,
      owner: { select: { id: true, username: true, displayName: true } },
      coverPhoto: {
        where: publicPhotoWhere,
        select: { id: true, width: true, height: true }
      },
      photos: {
        where: publicPhotoWhere,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: PRINTS_PER_ALBUM,
        select: { id: true, width: true, height: true }
      },
      _count: { select: { photos: { where: publicPhotoWhere } } }
    }
  });

  const ownerIds = Array.from(new Set(events.map((e) => e.owner.id)));
  const bookingOff = new Set(
    (
      await prisma.siteSettings.findMany({
        where: { ownerId: { in: ownerIds }, bookingEnabled: false },
        select: { ownerId: true }
      })
    ).map((s) => s.ownerId)
  );

  const columns: ArchiveColumn[] = [];
  const files: ArchiveFile[] = [];
  for (const event of events) {
    let column = columns.find((c) => c.username === event.owner.username);
    if (!column) {
      column = {
        username: event.owner.username,
        name: ownerName(event.owner),
        bookingEnabled: !bookingOff.has(event.owner.id),
        photoCount: 0,
        fileIndexes: []
      };
      columns.push(column);
    }
    column.photoCount += event._count.photos;
    // The cover leads the stack; the rest keep their gallery order.
    const prints = event.coverPhoto
      ? [event.coverPhoto, ...event.photos.filter((p) => p.id !== event.coverPhoto?.id)]
      : event.photos;
    column.fileIndexes.push(files.length);
    files.push({
      id: event.id,
      slug: event.slug,
      number: files.length + 1,
      column: columns.length - 1,
      title: pickText(locale, event.titleEn, event.titleZh),
      altTitle: pickText(locale === "zh" ? "en" : "zh", event.titleEn, event.titleZh),
      location: event.location,
      dateLabel: formatDateRange(event.dateStart, event.dateEnd),
      photoCount: event._count.photos,
      href: `${ownerBasePath(event.owner.username)}/gallery/${event.slug}`,
      prints: prints.slice(0, PRINTS_PER_ALBUM).map((p) => {
        const urls = photoUrls(event.id, p.id);
        return { thumb: urls.thumb, med: urls.med, width: p.width, height: p.height };
      })
    });
  }

  return { files, columns };
}
