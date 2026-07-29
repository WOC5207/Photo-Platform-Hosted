import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerBasePath, resolveOwner } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { publicPhotoWhere } from "@/lib/photoVisibility";

export const dynamic = "force-dynamic";

export default async function GalleryPage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const locale = await getLocale();
  const t = await getTranslations("gallery");

  const owner = await resolveOwner(username);
  const base = ownerBasePath(owner.username);
  const events = await prisma.event.findMany({
    where: { ownerId: owner.id, published: true },
    orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
    include: {
      coverPhoto: { where: publicPhotoWhere },
      photos: {
        where: publicPhotoWhere,
        orderBy: { sortOrder: "asc" },
        take: 1
      },
      _count: {
        select: { photos: { where: publicPhotoWhere } }
      }
    }
  });

  return (
    <div className="flex flex-col gap-8 rounded-xl border border-border bg-surface/92 p-5 sm:p-8">
      <div className="flex items-end gap-4 border-b border-border pb-6">
        <span aria-hidden="true" className="font-meta mb-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent">
          01
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.04em]">
          {t("title")}
        </h1>
      </div>

      {events.length === 0 ? (
        <p className="py-16 text-center text-fg-subtle">{t("empty")}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event, index) => {
            const cover = event.coverPhoto ?? event.photos[0] ?? null;
            return (
              <li key={event.id}>
                <Link
                  href={`${base}/gallery/${event.slug}`}
                  className="group flex h-full flex-col gap-3"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls(event.id, cover.id).med}
                      alt={pickText(locale, event.titleEn, event.titleZh)}
                      loading="lazy"
                      className="ui-image-frame aspect-[4/3] w-full rounded-lg object-cover transition-opacity group-hover:opacity-90"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-border bg-control text-4xl text-fg-faint">
                      ✦
                    </div>
                  )}
                  <div className="flex gap-3 px-1">
                    <span className="font-meta mt-0.5 text-[0.625rem] font-semibold tracking-[0.14em] text-accent">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                    <h2 className="font-display text-lg font-semibold tracking-[-0.015em] group-hover:text-accent-strong">
                      {pickText(locale, event.titleEn, event.titleZh)}
                    </h2>
                    <p className="font-meta mt-1 text-[0.6875rem] text-fg-subtle">
                      {(() => {
                        const range = formatDateRange(
                          event.dateStart,
                          event.dateEnd
                        );
                        return range ? `${range} · ` : "";
                      })()}
                      {t("photosCount", { count: event._count.photos })}
                    </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
