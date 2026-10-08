import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findOwner, ownerName, ownerBasePath } from "@/lib/owner";
import { formatCredits, pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import { formatPhotoExif } from "@/lib/exif";
import { safeExternalHttpUrl } from "@/lib/externalUrl";
import { platformThemeScope, resolveDashboardThemeMode } from "@/lib/themeColor";
import { fairField, sliceAlbums, type Archive } from "@/lib/archiveField";
import type { AlbumPhotos, ArchiveColumn, ArchiveFile, OwnerPalette } from "@/components/album3d/types";

/** Albums shown in the field. Past this the scene stops being browsable. */
const MAX_ALBUMS = 160;
/** One photographer's newest albums brought in when an address asks for them. */
const SLICE_ALBUMS = 48;
/** Prints stacked in the 360° view of one album. */
const PRINTS_PER_ALBUM = 12;

const archiveWhere = {
  published: true,
  owner: { status: "active" },
  photos: { some: publicPhotoWhere }
} satisfies Prisma.EventWhereInput;

const archiveOrder = [
  { owner: { createdAt: "asc" } },
  { dateStart: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" }
] satisfies Prisma.EventOrderByWithRelationInput[];

const archiveSelect = {
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
} satisfies Prisma.EventSelect;

/** Every album the archive could show, lightly: enough to choose and to count. */
const candidateSelect = {
  id: true,
  slug: true,
  ownerId: true,
  _count: { select: { photos: { where: publicPhotoWhere } } }
} satisfies Prisma.EventSelect;

type Candidate = Prisma.EventGetPayload<{ select: typeof candidateSelect }>;
type Totals = Map<string, { albums: number; photos: number }>;

function totalsOf(candidates: Candidate[]): Totals {
  const totals: Totals = new Map();
  for (const c of candidates) {
    const owner = totals.get(c.ownerId) ?? { albums: 0, photos: 0 };
    owner.albums += 1;
    owner.photos += c._count.photos;
    totals.set(c.ownerId, owner);
  }
  return totals;
}

/**
 * Everything the 3D site shows: the platform's published albums as files,
 * grouped into one column per photographer (in directory order, albums
 * newest first). Loaded once by the /3d layout, so moving between 3D screens
 * never asks the server for more than the image renditions themselves.
 *
 * The field's MAX_ALBUMS places are shared out fairly (see fairField), and
 * an address past the field brings its photographer in (loadArchiveSlice).
 */
export async function loadArchive(locale: string): Promise<Archive> {
  const candidates = await prisma.event.findMany({ where: archiveWhere, orderBy: archiveOrder, select: candidateSelect });
  const events = await prisma.event.findMany({
    where: { ...archiveWhere, id: { in: fairField(candidates, MAX_ALBUMS) } },
    orderBy: archiveOrder,
    select: archiveSelect
  });
  return buildArchive(locale, events, totalsOf(candidates));
}

/**
 * One photographer's part of the archive, for an address the field doesn't
 * hold (see sliceAlbums). Null when they have no public album, or `slug`
 * isn't one of them.
 */
export async function loadArchiveSlice(locale: string, username: string, slug?: string): Promise<Archive | null> {
  const candidates = await prisma.event.findMany({
    where: { ...archiveWhere, owner: { username, status: "active" } },
    orderBy: archiveOrder,
    select: candidateSelect
  });
  const ids = candidates.length > 0 ? sliceAlbums(candidates, SLICE_ALBUMS, slug) : null;
  if (!ids) return null;
  const events = await prisma.event.findMany({
    where: { ...archiveWhere, id: { in: ids } },
    orderBy: archiveOrder,
    select: archiveSelect
  });
  return buildArchive(locale, events, totalsOf(candidates));
}

async function buildArchive(
  locale: string,
  events: Prisma.EventGetPayload<{ select: typeof archiveSelect }>[],
  totals: Totals
): Promise<Archive> {
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
        albumCount: totals.get(event.owner.id)?.albums ?? 0,
        photoCount: totals.get(event.owner.id)?.photos ?? 0,
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
        return { id: p.id, thumb: urls.thumb, med: urls.med, full: urls.full, download: urls.download, width: p.width, height: p.height };
      })
    });
  }

  return { files, columns };
}

/**
 * Every photographer's saved site colours, by username, for the 3D screens
 * under their address. Only accounts that coloured at least one mode are
 * listed; everyone else keeps the platform's palette there.
 */
export async function loadOwnerPalettes(): Promise<Record<string, OwnerPalette>> {
  const rows = await prisma.siteSettings.findMany({
    where: { owner: { status: "active" } },
    select: {
      owner: { select: { username: true } },
      dashboardThemeMode: true,
      backgroundColor: true,
      surfaceColor: true,
      fieldColor: true,
      textColor: true,
      themeColor: true,
      darkBackgroundColor: true,
      darkSurfaceColor: true,
      darkFieldColor: true,
      darkTextColor: true,
      darkThemeColor: true
    }
  });

  const palettes: Record<string, OwnerPalette> = {};
  for (const row of rows) {
    const scope = platformThemeScope(
      {
        backgroundColor: row.backgroundColor,
        surfaceColor: row.surfaceColor,
        fieldColor: row.fieldColor,
        textColor: row.textColor,
        themeColor: row.themeColor
      },
      {
        backgroundColor: row.darkBackgroundColor,
        surfaceColor: row.darkSurfaceColor,
        fieldColor: row.darkFieldColor,
        textColor: row.darkTextColor,
        themeColor: row.darkThemeColor
      }
    );
    if (!scope.style) continue;
    palettes[row.owner.username] = {
      className: scope.className,
      style: scope.style,
      dashboard: resolveDashboardThemeMode(row.dashboardThemeMode) === "MATCH_SITE"
    };
  }
  return palettes;
}

/**
 * Whether the archive has the screen at an address: a photographer with a
 * published album, one of those albums, or a public photo in it. The same
 * filter as loadArchive, so the pages can answer 404 where the scene shows
 * "File not found".
 */
export async function archiveHasScreen(params: { username: string; slug?: string; photo?: string }): Promise<boolean> {
  let username: string;
  try {
    username = decodeURIComponent(params.username);
  } catch {
    return false;
  }
  const event = await prisma.event.findFirst({
    where: {
      published: true,
      owner: { username, status: "active" },
      ...(params.slug === undefined ? {} : { slug: params.slug }),
      photos: { some: params.photo === undefined ? publicPhotoWhere : { id: params.photo, ...publicPhotoWhere } }
    },
    select: { id: true }
  });
  return event !== null;
}

/** Prints laid on the light table. Past this the classic page shows the rest. */
const TABLE_LIMIT = 240;

/**
 * One album's public photos for the light table and the photo screen, with
 * the same credits, comment, links and EXIF the classic lightbox shows. An
 * unknown, unpublished or suspended album comes back empty.
 */
export async function loadAlbumPhotos(username: string, slug: string): Promise<AlbumPhotos> {
  const empty = { username, slug, photos: [], more: 0, coverId: null };
  const owner = await findOwner(username);
  if (!owner) return empty;
  const event = await prisma.event.findFirst({
    where: { ownerId: owner.id, slug, published: true },
    select: { id: true, coverPhotoId: true }
  });
  if (!event) return empty;
  const where = { eventId: event.id, ...publicPhotoWhere };
  const [total, photos] = await Promise.all([
    prisma.photo.count({ where }),
    prisma.photo.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: TABLE_LIMIT,
      include: {
        credits: {
          orderBy: { sortOrder: "asc" },
          include: { socialLinks: { orderBy: { sortOrder: "asc" } } }
        }
      }
    })
  ]);
  return {
    username,
    slug,
    more: Math.max(0, total - photos.length),
    coverId: event.coverPhotoId,
    photos: photos.map((p) => {
      const urls = photoUrls(event.id, p.id);
      return {
        id: p.id,
        thumb: urls.thumb,
        med: urls.med,
        full: urls.full,
        width: p.width,
        height: p.height,
        caption: formatCredits(p.credits),
        comment: p.comment,
        socialLinks: p.credits.flatMap((c) =>
          c.socialLinks
            .map((link) => ({ label: link.platform, url: safeExternalHttpUrl(link.url) }))
            .filter((link) => link.url !== "")
        ),
        exif: formatPhotoExif(p)
      };
    })
  };
}
