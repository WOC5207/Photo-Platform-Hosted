import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getSiteOwner } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function BookingListPage() {
  const locale = await getLocale();
  const t = await getTranslations("booking");

  const owner = await getSiteOwner();
  if (!(await getSiteSettings(owner.id)).bookingEnabled) notFound();

  const events = await prisma.bookingEvent.findMany({
    where: { ownerId: owner.id, open: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      slots: {
        include: {
          _count: { select: { bookings: { where: { status: "confirmed" } } } }
        }
      }
    }
  });

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <h1 className="text-3xl font-bold">{t("listTitle")}</h1>

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
                        {[formatDate(event.date), event.location || null]
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
