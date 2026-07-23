import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resolveOwner } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { formatDate, formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { getSiteSettings } from "@/lib/settings";
import { wallClockNow } from "@/lib/timeZone";

export const dynamic = "force-dynamic";

export default async function BookingListPage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const locale = await getLocale();
  const t = await getTranslations("booking");

  const owner = await resolveOwner(username);
  const settings = await getSiteSettings(owner.id);
  if (!settings.bookingEnabled) notFound();
  const now = wallClockNow(settings.timeZone);

  const events = await prisma.bookingEvent.findMany({
    where: {
      ownerId: owner.id,
      open: true,
      slots: { some: { startTime: { gt: now } } }
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      days: {
        where: { slots: { some: { startTime: { gt: now } } } },
        orderBy: { date: "asc" },
        select: { date: true }
      },
      slots: {
        where: { startTime: { gt: now } },
        include: {
          _count: { select: { bookings: { where: { status: "confirmed" } } } }
        }
      }
    }
  });

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <h1 className="text-3xl font-bold">{t("listTitle")}</h1>
      <p className="-mt-4 text-xs text-fg-subtle">
        {t("timeZoneNotice", { timeZone: settings.timeZone })}
      </p>

      {events.length === 0 ? (
        <p className="py-16 text-center text-fg-subtle">{t("listEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((event) => {
            const remaining = event.slots.reduce(
              (n, s) => n + Math.max(0, s.capacity - s._count.bookings),
              0
            );
            const description = pickText(
              locale,
              event.descriptionEn,
              event.descriptionZh
            );
            return (
              <li key={event.id}>
                <Link
                  href={`/book/${event.token}`}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition hover:border-border-strong"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {pickText(locale, event.titleEn, event.titleZh)}
                      </h2>
                      <p className="text-sm text-fg-subtle">
                        {[
                          event.days.length > 0
                            ? formatDateRange(
                                event.days[0].date,
                                event.days[event.days.length - 1].date
                              )
                            : formatDate(event.date),
                          event.location || null
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span
                      className={
                        remaining > 0
                          ? "shrink-0 rounded-md bg-success-surface px-2 py-0.5 text-xs text-success"
                          : "shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-subtle"
                      }
                    >
                      {remaining > 0
                        ? t("slotsLeft", { count: remaining })
                        : t("full")}
                    </span>
                  </div>
                  {description && (
                    <p className="line-clamp-2 text-sm text-fg-subtle">
                      {description}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
