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

export const dynamic = "force-dynamic";

export default async function AlbumPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; username: string }>;
  searchParams: Promise<{ photo?: string }>;
}) {
  const { slug, username } = await params;
  const { photo: initialPhotoId } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("gallery");

  const owner = await resolveOwner(username);
  const base = ownerBasePath(owner.username);
  // findFirst, not findUnique: slugs are unique per owner now, so this must
  // name whose gallery it is — otherwise it could serve another photographer's
  // album under this one's URL.
  const event = await prisma.event.findFirst({
    where: { ownerId: owner.id, slug },
    include: {
      photos: {
        where: { pendingBatchId: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          credits: {
            orderBy: { sortOrder: "asc" },
            include: { socialLinks: { orderBy: { sortOrder: "asc" } } }
          }
        }
      }
    }
  });
  // Unpublished events are fully hidden from the public.
  if (!event || !event.published) notFound();

  const photos: AlbumPhoto[] = event.photos.map((p) => {
    const urls = photoUrls(event.id, p.id);
    return {
      id: p.id,
      thumb: urls.thumb,
      med: urls.med,
      full: urls.full,
      caption: formatCredits(p.credits),
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
        <h1 className="mt-2 text-3xl font-bold">
          {pickText(locale, event.titleEn, event.titleZh)}
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
          {[
            formatDateRange(event.dateStart, event.dateEnd) || null,
            event.location || null,
            t("photosCount", { count: photos.length })
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
          close: t("close"),
          previous: t("previous"),
          next: t("next")
        }}
      />
    </div>
  );
}
