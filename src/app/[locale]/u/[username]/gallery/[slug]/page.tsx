import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerBasePath, resolveOwner } from "@/lib/owner";
import { pickText, formatCredits } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { formatPhotoExif } from "@/lib/exif";
import { Link } from "@/i18n/navigation";
import AlbumViewer, { type AlbumPhoto } from "@/components/gallery/AlbumViewer";
import { publicPhotoWhere } from "@/lib/photoVisibility";

export const dynamic = "force-dynamic";
const ALBUM_PAGE_SIZE = 48;

export default async function AlbumPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; username: string }>;
  searchParams: Promise<{ photo?: string; page?: string }>;
}) {
  const { slug, username } = await params;
  const {
    photo: initialPhotoId,
    page: requestedPage
  } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("gallery");

  const owner = await resolveOwner(username);
  const base = ownerBasePath(owner.username);
  // findFirst, not findUnique: slugs are unique per owner now, so this must
  // name whose gallery it is — otherwise it could serve another photographer's
  // album under this one's URL.
  const event = await prisma.event.findFirst({
    where: { ownerId: owner.id, slug },
  });
  // Unpublished events are fully hidden from the public.
  if (!event || !event.published) notFound();

  const photoWhere = { eventId: event.id, ...publicPhotoWhere };
  const totalPhotos = await prisma.photo.count({ where: photoWhere });
  const totalPages = Math.max(1, Math.ceil(totalPhotos / ALBUM_PAGE_SIZE));
  let page = Math.min(
    totalPages,
    Math.max(1, Number.parseInt(requestedPage ?? "1", 10) || 1)
  );

  if (initialPhotoId) {
    const target = await prisma.photo.findFirst({
      where: { ...photoWhere, id: initialPhotoId },
      select: { id: true, sortOrder: true, createdAt: true }
    });
    if (target) {
      const preceding = await prisma.photo.count({
        where: {
          ...photoWhere,
          OR: [
            { sortOrder: { lt: target.sortOrder } },
            {
              sortOrder: target.sortOrder,
              createdAt: { lt: target.createdAt }
            },
            {
              sortOrder: target.sortOrder,
              createdAt: target.createdAt,
              id: { lt: target.id }
            }
          ]
        }
      });
      page = Math.floor(preceding / ALBUM_PAGE_SIZE) + 1;
    }
  }

  const pagePhotos = await prisma.photo.findMany({
    where: photoWhere,
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
      { id: "asc" }
    ],
    skip: (page - 1) * ALBUM_PAGE_SIZE,
    take: ALBUM_PAGE_SIZE,
    include: {
      credits: {
        orderBy: { sortOrder: "asc" },
        include: { socialLinks: { orderBy: { sortOrder: "asc" } } }
      }
    }
  });

  const photos: AlbumPhoto[] = pagePhotos.map((p) => {
    const urls = photoUrls(event.id, p.id);
    return {
      id: p.id,
      thumb: urls.thumb,
      med: urls.med,
      full: urls.full,
      caption: formatCredits(p.credits),
      comment: p.comment,
      socialLinks: p.credits.flatMap((c) =>
        c.socialLinks.map((s) => ({
          label: s.platform,
          url: s.url
        }))
      ),
      width: p.width,
      height: p.height,
      exif: formatPhotoExif(p)
    };
  });

  const description = pickText(locale, event.descriptionEn, event.descriptionZh);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <div>
        <Link
          href={`${base}/gallery`}
          className="text-sm text-fg-subtle hover:text-fg"
        >
          ← {t("backToGallery")}
        </Link>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-[-0.04em]">
          {pickText(locale, event.titleEn, event.titleZh)}
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
          {[
            formatDateRange(event.dateStart, event.dateEnd) || null,
            event.location || null,
            t("photosCount", { count: totalPhotos })
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {description && (
          <p className="mt-3 max-w-2xl whitespace-pre-line text-fg-muted">
            {description}
          </p>
        )}
      </div>

      <AlbumViewer
        photos={photos}
        initialPhotoId={initialPhotoId}
        labels={{
          open: t("openPhoto"),
          close: t("close"),
          previous: t("previous"),
          next: t("next")
        }}
        positionOffset={(page - 1) * ALBUM_PAGE_SIZE}
        totalPhotos={totalPhotos}
      />
      {totalPages > 1 && (
        <nav
          aria-label={t("paginationLabel")}
          className="flex items-center justify-center gap-3 border-t border-fg/10 pt-5"
        >
          {page > 1 ? (
            <Link
              href={
                page === 2
                  ? `${base}/gallery/${slug}`
                  : `${base}/gallery/${slug}?page=${page - 1}`
              }
              className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
            >
              {t("previousPage")}
            </Link>
          ) : (
            <span className="min-h-11 px-4 py-2 text-sm text-fg-faint">
              {t("previousPage")}
            </span>
          )}
          <span className="text-sm text-fg-subtle">
            {t("pageStatus", { page, total: totalPages })}
          </span>
          {page < totalPages ? (
            <Link
              href={`${base}/gallery/${slug}?page=${page + 1}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
            >
              {t("nextPage")}
            </Link>
          ) : (
            <span className="min-h-11 px-4 py-2 text-sm text-fg-faint">
              {t("nextPage")}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
