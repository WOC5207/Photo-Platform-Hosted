import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";

export default async function AdminEventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("adminEvents");
  const user = await requireUser(locale);

  const events = await prisma.event.findMany({
    where: { ownerId: user.id },
    orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
    include: {
      coverPhoto: { where: { pendingBatchId: null } },
      photos: {
        where: { pendingBatchId: null },
        orderBy: { sortOrder: "asc" },
        take: 1
      },
      _count: {
        select: { photos: { where: { pendingBatchId: null } } }
      }
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("listTitle")}</h1>
        <Link
          href="/dashboard/events/new"
          className={buttonClasses({ variant: "primary" })}
        >
          + {t("newEvent")}
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-fg-subtle">{t("noEvents")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const cover = event.coverPhoto ?? event.photos[0] ?? null;
            return (
              <li key={event.id}>
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls(event.id, cover.id).thumb}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-surface-2 text-3xl text-fg-faint">
                      ✦
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">
                        {pickText(locale, event.titleEn, event.titleZh)}
                      </h2>
                      <p className="text-xs text-fg-subtle">
                        {formatDateRange(event.dateStart, event.dateEnd) || "—"}{" "}
                        · {t("photosCount", { count: event._count.photos })}
                      </p>
                    </div>
                    <span
                      className={
                        event.published
                          ? "rounded-md bg-success-surface px-2 py-0.5 text-xs text-success"
                          : "rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-subtle"
                      }
                    >
                      {event.published ? t("published") : t("draft")}
                    </span>
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
