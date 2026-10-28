import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { resolveOwner } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { formatDate, formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { getSiteSettings } from "@/lib/settings";
import { wallClockNow } from "@/lib/timeZone";
import { metaLabel } from "@/components/album3d/booking/classes";
import {
  ArchiveHeading,
  ArchivePage,
  LocalTimeRule,
  SeatPips
} from "@/components/booking/archive";
import styles from "@/components/booking/Archive.module.css";

export const dynamic = "force-dynamic";

export default async function BookingListPage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const locale = await getLocale();
  const t = await getTranslations("booking");
  const t3 = await getTranslations("album3d");

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
    <ArchivePage
      aside={
        <div className="flex flex-col gap-6">
          <ArchiveHeading
            crumbs={[`@${owner.username}`, t3("menuBooking")]}
            title={t("listTitle")}
          />
          {events.length > 0 && (
            <p className={metaLabel}>
              {t3("boardCount")} <span className="text-fg">{pad(events.length)}</span>
            </p>
          )}
          <LocalTimeRule marker={t("eventLocalTimeMarker")}>
            {t("eventLocalTimeNotice")}
          </LocalTimeRule>
        </div>
      }
    >
      <div className={`${styles.board} ${styles.rise} p-4 sm:p-6`}>
        {events.length === 0 ? (
          <p className="py-16 text-center text-sm text-fg-muted">{t("listEmpty")}</p>
        ) : (
          <ol className="grid gap-4">
            {events.map((event, i) => {
              const remaining = event.slots.reduce(
                (n, s) => n + Math.max(0, s.capacity - s._count.bookings),
                0
              );
              const capacity = event.slots.reduce((n, s) => n + s.capacity, 0);
              const description = pickText(
                locale,
                event.descriptionEn,
                event.descriptionZh
              );
              const dates =
                event.days.length > 0
                  ? formatDateRange(
                      event.days[0].date,
                      event.days[event.days.length - 1].date
                    )
                  : formatDate(event.date);
              return (
                <li key={event.id}>
                  <Link
                    href={`/book/${event.token}`}
                    data-full={remaining > 0 ? undefined : ""}
                    className={`${styles.tile} group flex items-stretch gap-4 py-5 pl-6 pr-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40`}
                  >
                    <span aria-hidden="true" className="font-meta w-7 shrink-0 pt-1 text-[0.6875rem] tracking-[0.14em] text-fg-subtle">
                      {pad(i + 1)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="font-meta text-[0.6875rem] uppercase tracking-[0.12em] text-accent-text">
                        {dates}
                      </span>
                      <span className="text-xl font-bold uppercase leading-tight tracking-[0.01em] sm:text-2xl">
                        {pickText(locale, event.titleEn, event.titleZh)}
                      </span>
                      {event.location && (
                        <span className="text-sm text-fg-muted">{event.location}</span>
                      )}
                      {description && (
                        <span className="line-clamp-2 whitespace-pre-line text-sm text-fg-subtle">
                          {description}
                        </span>
                      )}
                      <span className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <SeatPips left={remaining} total={capacity} />
                        <span
                          className={`font-meta text-[0.625rem] uppercase tracking-[0.14em] ${
                            remaining > 0 ? "text-fg" : "text-fg-subtle"
                          }`}
                        >
                          {remaining > 0
                            ? t3("boardSeats", { count: remaining })
                            : t("full")}
                        </span>
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="self-center text-2xl text-fg-subtle transition duration-200 group-hover:translate-x-1 group-hover:text-fg motion-reduce:transition-none"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </ArchivePage>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
