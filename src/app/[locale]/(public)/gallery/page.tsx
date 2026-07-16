import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getSiteOwner } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const locale = await getLocale();
  const t = await getTranslations("gallery");

  const owner = await getSiteOwner();
  const events = await prisma.event.findMany({
    where: { ownerId: owner.id, published: true },
    orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
    include: {
      coverPhoto: true,
      photos: { orderBy: { sortOrder: "asc" }, take: 1 },
      _count: { select: { photos: true } }
    }
  });

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      {events.length === 0 ? (
        <p className="py-16 text-center text-fg-subtle">{t("empty")}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const cover = event.coverPhoto ?? event.photos[0] ?? null;
            return (
              <li key={event.id}>
                <Link
                  href={`/gallery/${event.slug}`}
                  className="group flex flex-col gap-2"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls(event.id, cover.id).med}
                      alt={pickText(locale, event.titleEn, event.titleZh)}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-xl object-cover transition group-hover:opacity-90"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-surface text-4xl text-fg-faint">
                      ✦
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold group-hover:underline">
                      {pickText(locale, event.titleEn, event.titleZh)}
                    </h2>
                    <p className="text-sm text-fg-subtle">
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
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
