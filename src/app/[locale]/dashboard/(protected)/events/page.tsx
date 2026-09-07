import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { photoUrls } from "@/lib/images";
import { formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export default async function AdminEventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("eventWorkspace");
  const user = await requireUser(locale);
  const [events, legacyBookings] = await Promise.all([
    prisma.event.findMany({
      where: { ownerId: user.id }, orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      include: {
        coverPhoto: { where: { pendingBatchId: null } },
        _count: { select: { photos: { where: { pendingBatchId: null } } } },
        bookingEvent: {
          where: { ownerId: user.id },
          include: { _count: { select: { days: true } } }
        }
      }
    }),
    prisma.bookingEvent.findMany({
      where: { ownerId: user.id, galleryEventId: null },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    })
  ]);
  return <div className="flex flex-col gap-8">
    <PageHeader title={t("listTitle")} description={t("listDescription")} index="02"
      action={(events.length + legacyBookings.length) > 0 ? <Link href="/dashboard/events/new" className={buttonClasses({ variant: "primary" })}>+ {t("newEvent")}</Link> : undefined} />
    <nav aria-label={t("allEventTools")} className="flex flex-wrap gap-2">
      <Link href="/dashboard/preparation/slots" className={buttonClasses({ size: "compact", variant: "ghost" })}>{t("allSlots")}</Link>
      <Link href="/dashboard/preparation/equipment" className={buttonClasses({ size: "compact", variant: "ghost" })}>{t("allChecklists")}</Link>
      <Link href="/dashboard/bookings" className={buttonClasses({ size: "compact", variant: "ghost" })}>{t("allBookings")}</Link>
    </nav>
    {events.length + legacyBookings.length === 0 ? <EmptyState
      title={t("emptyTitle")} description={t("createHint")}
      action={<Link href="/dashboard/events/new" className={buttonClasses({ variant: "primary" })}>+ {t("newEvent")}</Link>}
      steps={["gallery", "bookings", "equipment"].map(key => ({ title: t(key), description: t(key + "Description") }))}
    /> : <ul className="grid gap-4 lg:grid-cols-2">
      {events.map((event, index) => <li key={event.id} className="ui-panel flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        <header className="flex items-start gap-4">
          {event.coverPhoto && <img src={photoUrls(event.id, event.coverPhoto.id).thumb} alt="" loading="lazy" className="ui-image-frame h-20 w-20 shrink-0 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="font-meta mb-2 text-xs tabular-nums text-accent">{String(index + 1).padStart(2, "0")} · {formatDateRange(event.dateStart, event.dateEnd) || t("noDate")}</p>
            <h2 className="break-words font-display text-2xl font-semibold"><Link href={"/dashboard/events/" + event.id} className="underline-offset-4 hover:underline">{pickText(locale, event.titleEn, event.titleZh)}</Link></h2>
            {event.location && <p className="mt-2 break-words text-sm text-fg-subtle">{event.location}</p>}
          </div>
        </header>
        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-control p-4 text-sm">
          <div><dt className="text-xs text-fg-subtle">{t("gallery")}</dt><dd className="mt-1 font-medium">{t("photoCount", { count: event._count.photos })} · {event.published ? t("published") : t("draft")}</dd></div>
          <div><dt className="text-xs text-fg-subtle">{t("bookings")}</dt><dd className="mt-1 font-medium">{event.bookingEvent ? t("dayCount", { count: event.bookingEvent._count.days }) + " · " + (event.bookingEvent.open ? t("open") : t("closed")) : t("notSetUp")}</dd></div>
        </dl>
        <div className="mt-auto flex flex-wrap gap-2">
          <Link href={"/dashboard/events/" + event.id} className={buttonClasses({ size: "compact" })}>{t("gallery")}</Link>
          {event.bookingEvent ? <>
            <Link href={"/dashboard/bookings/" + event.bookingEvent.id} className={buttonClasses({ size: "compact" })}>{t("bookings")}</Link>
            <Link href={"/dashboard/preparation/equipment?event=" + event.bookingEvent.id} className={buttonClasses({ size: "compact" })}>{t("equipment")}</Link>
          </> : <Link href={"/dashboard/events/" + event.id + "/setup"} className={buttonClasses({ size: "compact" })}>{t("addBooking")}</Link>}
        </div>
      </li>)}
      {legacyBookings.map(booking => <li key={booking.id} className="ui-panel flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <p className="font-meta text-xs text-fg-subtle">{t("legacyBooking")}</p>
        <h2 className="break-words font-display text-2xl font-semibold">{pickText(locale, booking.titleEn, booking.titleZh)}</h2>
        <p className="text-sm text-fg-subtle">{t("legacyBookingHint")}</p>
        <Link href={"/dashboard/bookings/" + booking.id} className={buttonClasses({ className: "mt-auto self-start" })}>{t("openEvent")}</Link>
      </li>)}
    </ul>}
  </div>;
}
