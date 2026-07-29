import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";

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
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("listTitle")}
        action={
        <Link
          href="/dashboard/events/new"
          className={buttonClasses({ variant: "primary" })}
        >
          + {t("newEvent")}
        </Link>
        }
      />

      {events.length === 0 ? (
        <p className="ui-panel flex min-h-40 items-center justify-center p-8 text-center text-sm text-fg-subtle">
          {t("noEvents")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event, index) => {
            const cover = event.coverPhoto ?? event.photos[0] ?? null;
            return (
              <li key={event.id}>
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-3 transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-accent/30 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls(event.id, cover.id).thumb}
                      alt=""
                      loading="lazy"
                      className="ui-image-frame aspect-[4/3] w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-border bg-control text-3xl text-fg-faint">
                      ✦
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 px-1 pb-1">
                    <div className="flex min-w-0 gap-3">
                      <span className="font-meta mt-0.5 text-[0.625rem] font-semibold tracking-[0.14em] text-accent">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                      <h2 className="font-semibold">
                        {pickText(locale, event.titleEn, event.titleZh)}
                      </h2>
                      <p className="text-xs text-fg-subtle">
                        {formatDateRange(event.dateStart, event.dateEnd) || "—"}{" "}
                        · {t("photosCount", { count: event._count.photos })}
                      </p>
                      </div>
                    </div>
                    <span
                      className={
                        event.published
                          ? "rounded-md bg-success-surface px-2 py-1 text-[0.6875rem] font-semibold text-success"
                          : "rounded-md bg-control px-2 py-1 text-[0.6875rem] font-semibold text-fg-subtle"
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
