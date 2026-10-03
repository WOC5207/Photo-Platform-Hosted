import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerName, ownerBasePath } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import AlbumArchive, {
  type ArchiveColumn,
  type ArchiveFile
} from "@/components/album3d/AlbumArchive";

// Lists live accounts and albums — never prerender.
export const dynamic = "force-dynamic";

// A prototype beside the live directory, so keep it out of search results.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("album3d");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Albums shown in the field. Past this the scene stops being browsable. */
const MAX_ALBUMS = 160;
/** Prints stacked in the 360° view of one album. */
const PRINTS_PER_ALBUM = 12;

/**
 * Prototype: the platform's published albums as a three.js archive.
 *
 * Columns are photographers (in directory order) and files are their albums,
 * newest first. Everything the scene needs is resolved here, so the client
 * never asks for more than the image renditions themselves.
 */
export default async function AlbumArchivePage() {
  const locale = await getLocale();

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
      owner: { select: { username: true, displayName: true } },
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

  const columns: ArchiveColumn[] = [];
  const files: ArchiveFile[] = [];
  for (const event of events) {
    let column = columns.find((c) => c.username === event.owner.username);
    if (!column) {
      column = {
        username: event.owner.username,
        name: ownerName(event.owner),
        fileIndexes: []
      };
      columns.push(column);
    }
    // The cover leads the stack; the rest keep their gallery order.
    const prints = event.coverPhoto
      ? [event.coverPhoto, ...event.photos.filter((p) => p.id !== event.coverPhoto?.id)]
      : event.photos;
    column.fileIndexes.push(files.length);
    files.push({
      id: event.id,
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

  return <AlbumArchive files={files} columns={columns} />;
}
