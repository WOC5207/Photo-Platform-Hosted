import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatDate, formatDateRange } from "@/lib/datetime";
import { getSiteSettings, resolveSubjectTerm } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import BookingForm, { type PublicDay } from "@/components/booking/BookingForm";
import { isNaiveDateTimePast } from "@/lib/timeZone";
import {
  ArchiveHeading,
  ArchivePage,
  LocalTimeRule
} from "@/components/booking/archive";
import styles from "@/components/booking/Archive.module.css";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations("booking");
  const tc = await getTranslations("common");
  const t3 = await getTranslations("album3d");
  if (!/^[a-z0-9]+$/.test(token)) notFound();

  // The token identifies the event and, through it, the owner — which is why
  // this route needs no owner in its path. Look the event up FIRST: whether
  // booking is on, and the vocabulary shown, are that owner's settings, so
  // they cannot be read before we know whose event this is.
  const event = await prisma.bookingEvent.findUnique({
    where: { token },
    include: {
      owner: { select: { username: true } },
      days: {
        orderBy: { date: "asc" },
        include: {
          slots: {
            orderBy: { startTime: "asc" },
            include: {
              _count: {
                select: { bookings: { where: { status: "confirmed" } } }
              }
            }
          }
        }
      }
    }
  });
  if (!event) notFound();

  const settings = await getSiteSettings(event.ownerId);
  const subjectTerm = resolveSubjectTerm(settings, locale, tc("subjectTerm"));
  if (!settings.bookingEnabled) notFound();

  const visibleEventDays = event.days
    .map((day) => ({
      ...day,
      slots: day.slots.filter(
        (slot) => !isNaiveDateTimePast(slot.startTime, settings.timeZone)
      )
    }))
    .filter((day) => day.slots.length > 0);
  const days: PublicDay[] = visibleEventDays.map((day) => ({
    id: day.id,
    date: formatDate(day.date),
    slots: day.slots.map((s) => ({
      id: s.id,
      start: s.startTime.toISOString(),
      end: s.endTime.toISOString(),
      remaining: Math.max(0, s.capacity - s._count.bookings),
      capacity: s.capacity,
      pricePerPerson: settings.bookingPriceEnabled ? s.pricePerPerson : "",
      description: pickText(locale, s.descriptionEn, s.descriptionZh)
    }))
  }));
  const dateLabel =
    visibleEventDays.length > 0
      ? formatDateRange(
          visibleEventDays[0].date,
          visibleEventDays[visibleEventDays.length - 1].date
        )
      : formatDate(event.date);

  const description = pickText(locale, event.descriptionEn, event.descriptionZh);

  return (
    <ArchivePage
      aside={
        <div className="flex flex-col gap-5">
          <ArchiveHeading
            crumbs={[
              <Link
                key="board"
                href={`/u/${event.owner.username}/booking`}
                className="hover:text-fg"
              >
                @{event.owner.username}
              </Link>,
              t3("crumbSchedule")
            ]}
            title={pickText(locale, event.titleEn, event.titleZh)}
            meta={[dateLabel, event.location || null].filter(Boolean).join(" · ")}
          />
          {description && (
            <p className="whitespace-pre-line text-sm leading-6 text-fg-muted">
              {description}
            </p>
          )}
          <LocalTimeRule marker={t("eventLocalTimeMarker")}>
            {t("eventLocalTimeNotice")}
          </LocalTimeRule>
          <p className="text-xs text-fg-muted">
            {t("alreadyBooked")}{" "}
            <Link
              href={`/book/${token}/check`}
              className="inline-flex min-h-8 items-center font-semibold text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {t("checkBookingButton")} <span aria-hidden="true">&nbsp;↗</span>
            </Link>
          </p>
        </div>
      }
    >
      {!event.open ? (
        <p className={`${styles.board} p-8 text-center text-sm text-fg-muted`}>
          {t("closedNotice")}
        </p>
      ) : (
        // The "nothing available" notice lives inside the form on purpose. A
        // multi-slot cart can book out the last openings, and this page
        // re-renders as part of the booking action's revalidation — moving the
        // check out here would unmount the form mid-success and throw away the
        // confirmation (and the visitor's only copy of their manage links).
        <BookingForm
          days={days}
          subjectTerm={subjectTerm}
          eventToken={token}
        />
      )}
    </ArchivePage>
  );
}
