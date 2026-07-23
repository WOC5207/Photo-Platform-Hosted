import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { pickText } from "@/lib/content";
import { formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import BookingMergePanel, {
  type MergeEventItem
} from "@/components/admin/BookingMergePanel";

export default async function AdminBookingsPage() {
  const locale = await getLocale();
  const t = await getTranslations("adminBookings");
  const ts = await getTranslations("adminSite");
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);

  const events = await prisma.bookingEvent.findMany({
    where: { ownerId: user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      days: { orderBy: { date: "asc" }, select: { date: true } },
      lotteryDraw: { select: { id: true } },
      slots: {
        include: {
          _count: {
            select: { bookings: { where: { status: "confirmed" } } }
          }
        }
      }
    }
  });

  const mergeItems: MergeEventItem[] = events.map((event) => {
    const capacity = event.slots.reduce((n, s) => n + s.capacity, 0);
    const booked = event.slots.reduce((n, s) => n + s._count.bookings, 0);
    const dateLabel =
      event.days.length > 0
        ? formatDateRange(
            event.days[0].date,
            event.days[event.days.length - 1].date
          )
        : "";
    const meta = [
      dateLabel,
      event.days.length > 1 ? t("dayCount", { count: event.days.length }) : null,
      event.location || null,
      t("booked", { booked, capacity })
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: event.id,
      title: pickText(locale, event.titleEn, event.titleZh),
      meta,
      statusLabel: !settings.bookingEnabled
        ? t("offPublicly")
        : event.open
          ? t("open")
          : t("closed"),
      statusOpen: settings.bookingEnabled && event.open,
      hasLottery: !!event.lotteryDraw
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("listTitle")}</h1>
        <Link
          href="/dashboard/bookings/new"
          className={buttonClasses({ variant: "primary" })}
        >
          + {t("newEvent")}
        </Link>
      </div>

      {!settings.bookingEnabled && (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-subtle"
        >
          {ts("groupBookingHint")}
        </p>
      )}

      {events.length === 0 ? (
        <p className="text-fg-subtle">{t("noEvents")}</p>
      ) : (
        <BookingMergePanel events={mergeItems} lotteryLabel={t("lotteryTool")} />
      )}
    </div>
  );
}
