import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";

export default async function AdminBookingsPage() {
  const locale = await getLocale();
  const t = await getTranslations("adminBookings");
  const user = await requireUser(locale);

  const events = await prisma.bookingEvent.findMany({
    where: { ownerId: user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      slots: {
        include: {
          _count: {
            select: { bookings: { where: { status: "confirmed" } } }
          }
        }
      }
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("listTitle")}</h1>
        <Link
          href="/dashboard/bookings/new"
          className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90"
        >
          + {t("newEvent")}
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-fg-subtle">{t("noEvents")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const capacity = event.slots.reduce((n, s) => n + s.capacity, 0);
            const booked = event.slots.reduce(
              (n, s) => n + s._count.bookings,
              0
            );
            return (
              <li key={event.id}>
                <Link
                  href={`/dashboard/bookings/${event.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong"
                >
                  <div>
                    <h2 className="font-semibold">
                      {pickText(locale, event.titleEn, event.titleZh)}
                    </h2>
                    <p className="text-sm text-fg-subtle">
                      {formatDate(event.date)}
                      {event.location ? ` · ${event.location}` : ""} ·{" "}
                      {t("booked", { booked, capacity })}
                    </p>
                  </div>
                  <span
                    className={
                      event.open
                        ? "rounded-md bg-success-surface px-2 py-0.5 text-xs text-success"
                        : "rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-subtle"
                    }
                  >
                    {event.open ? t("open") : t("closed")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
