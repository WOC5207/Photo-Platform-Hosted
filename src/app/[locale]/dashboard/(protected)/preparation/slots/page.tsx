import { notFound } from "next/navigation";
import EventWorkspaceHeader from "@/components/events/EventWorkspaceHeader";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatDate, formatTime } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import PreparationHeader from "../PreparationHeader";
import SubmitButton from "../SubmitButton";
import { finishSlot } from "../actions";

export default async function PreparationSlotsPage({ searchParams }: {
  searchParams: Promise<{ event?: string; status?: string; page?: string }>;
}) {
  const [locale, t, params] = await Promise.all([getLocale(), getTranslations("preparation"), searchParams]);
  const user = await requireUser(locale);
  const status = params.status === "finished" || params.status === "pending" ? params.status : "all";
  const events = await prisma.bookingEvent.findMany({
    where: { ownerId: user.id }, orderBy: { date: "desc" }, select: { id: true, titleEn: true, titleZh: true }
  });
  const eventId = params.event || undefined;
  const event = eventId ? await prisma.bookingEvent.findFirst({ where: { id: eventId, ownerId: user.id }, include: { galleryEvent: { where: { ownerId: user.id } } } }) : null;
  if (eventId && !event) notFound();
  const where = {
    bookingEvent: { ownerId: user.id },
    ...(eventId ? { bookingEventId: eventId } : {}),
    bookings: { some: { status: "confirmed" } },
    ...(status === "finished" ? { finishedAt: { not: null } } : status === "pending" ? { finishedAt: null } : {})
  };
  const total = await prisma.timeSlot.count({ where });
  const pages = Math.max(1, Math.ceil(total / 30));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const slots = await prisma.timeSlot.findMany({
    where, orderBy: [{ startTime: "asc" }, { id: "asc" }], skip: (page - 1) * 30, take: 30,
    include: { bookingEvent: true, bookings: { where: { status: "confirmed" }, orderBy: { createdAt: "asc" } } }
  });
  const pageHref = (n: number) => "/dashboard/preparation/slots?" + new URLSearchParams({
    ...(eventId ? { event: eventId } : {}), status, page: String(n)
  }).toString();

  return <div className="flex flex-col gap-8">
    {event ? <EventWorkspaceHeader title={pickText(locale, (event.galleryEvent ?? event).titleEn, (event.galleryEvent ?? event).titleZh)} galleryId={event.galleryEvent?.id} bookingId={event.id} active="slots" /> : <PreparationHeader active="slots" />}
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">{t("slots")}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-subtle">{t("slotsHint")}</p>
      </div>
      <form className="flex flex-col gap-3 rounded-xl bg-control p-4 sm:flex-row sm:items-end">
        {event ? <input type="hidden" name="event" value={event.id} /> : <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium">
          <span>{t("event")}</span>
          <select name="event" defaultValue={eventId || ""} className={controlClasses}>
            <option value="">{t("allEvents")}</option>
            {events.map(event => <option key={event.id} value={event.id}>{pickText(locale, event.titleEn, event.titleZh)}</option>)}
          </select>
        </label>}
        <label className="flex flex-col gap-2 text-sm font-medium">
          <span>{t("status")}</span>
          <select name="status" defaultValue={status} className={controlClasses}>
            <option value="all">{t("allStatuses")}</option>
            <option value="pending">{t("pending")}</option>
            <option value="finished">{t("finished")}</option>
          </select>
        </label>
        <button type="submit" className={buttonClasses()}>{t("filter")}</button>
      </form>
      <p className="font-meta text-xs tabular-nums text-fg-subtle">{t("slotCount", { count: total })} · {t("localTime")}</p>
      {!slots.length ? <div className="ui-panel flex flex-col items-start gap-3 p-6 sm:p-8">
        <h3 className="font-display text-xl font-semibold">{t("emptySlots")}</h3>
        <p className="text-sm text-fg-subtle">{t("emptySlotsHint")}</p>
        <Link href="/dashboard/bookings" className={buttonClasses()}>{t("manageBookings")}</Link>
      </div> : <ol className="flex flex-col gap-4">
        {slots.map(slot => <li key={slot.id} className="ui-panel overflow-hidden">
          <article className="grid lg:grid-cols-[13rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 bg-control p-5">
              <p className="font-meta text-sm tabular-nums text-fg-muted">{formatDate(slot.startTime)}</p>
              <h3 className="text-xl font-semibold tabular-nums">{formatTime(slot.startTime)}–{formatTime(slot.endTime)}</h3>
              <p className={slot.finishedAt ? "text-sm font-semibold text-success" : "text-sm font-semibold text-accent"}>
                {slot.finishedAt ? t("finished") : t("pending")}
              </p>
              <form action={finishSlot} className="mt-auto pt-3">
                <input type="hidden" name="id" value={slot.id} />
                <input type="hidden" name="finished" value={String(!slot.finishedAt)} />
                <SubmitButton primary={!slot.finishedAt}>{slot.finishedAt ? t("undoFinished") : t("markFinished")}</SubmitButton>
              </form>
            </div>
            <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={"/dashboard/bookings/" + slot.bookingEventId} className="font-display text-xl font-semibold underline-offset-4 hover:underline">
                    {pickText(locale, slot.bookingEvent.titleEn, slot.bookingEvent.titleZh)}
                  </Link>
                  {slot.bookingEvent.location && <p className="mt-1 break-words text-sm text-fg-muted">{t("location")}: {slot.bookingEvent.location}</p>}
                </div>
                <span className="text-xs tabular-nums text-fg-subtle">{t("bookedCount", { count: slot.bookings.length, capacity: slot.capacity })}</span>
              </header>
              {pickText(locale, slot.descriptionEn, slot.descriptionZh) && <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">{pickText(locale, slot.descriptionEn, slot.descriptionZh)}</p>}
              {slot.pricePerPerson && <p className="text-sm text-fg-muted">{t("price")}: {slot.pricePerPerson}</p>}
              <ul className="flex flex-col divide-y divide-border">
                {slot.bookings.map(booking => <li key={booking.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <p className="break-words font-semibold">{booking.name}{booking.subject && <span className="font-normal text-fg-muted"> · {booking.subject}</span>}</p>
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {booking.contactValue && <div className="min-w-0"><dt className="text-xs text-fg-subtle">{t("contact")}{booking.contactMethod ? " · " + booking.contactMethod : ""}</dt><dd className="break-words">{booking.contactValue}</dd></div>}
                    {booking.email && <div className="min-w-0"><dt className="text-xs text-fg-subtle">{t("email")}</dt><dd className="break-words">{booking.email}</dd></div>}
                    {booking.notes && <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-fg-subtle">{t("notes")}</dt><dd className="whitespace-pre-wrap break-words">{booking.notes}</dd></div>}
                  </dl>
                </li>)}
              </ul>
            </div>
          </article>
        </li>)}
      </ol>}
      {pages > 1 && <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
        {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClasses()}>{t("previous")}</Link> : <span />}
        <span className="text-sm tabular-nums text-fg-subtle">{t("pageCount", { page, pages })}</span>
        {page < pages ? <Link href={pageHref(page + 1)} className={buttonClasses()}>{t("next")}</Link> : <span />}
      </nav>}
    </section>
  </div>;
}
