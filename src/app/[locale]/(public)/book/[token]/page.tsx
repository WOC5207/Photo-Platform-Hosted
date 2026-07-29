import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatDate, formatDateRange } from "@/lib/datetime";
import { getSiteSettings, resolveSubjectTerm } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import BookingForm, { type PublicDay } from "@/components/booking/BookingForm";
import { isNaiveDateTimePast } from "@/lib/timeZone";

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
  if (!/^[a-z0-9]+$/.test(token)) notFound();

  // The token identifies the event and, through it, the owner — which is why
  // this route needs no owner in its path. Look the event up FIRST: whether
  // booking is on, and the vocabulary shown, are that owner's settings, so
  // they cannot be read before we know whose event this is.
  const event = await prisma.bookingEvent.findUnique({
    where: { token },
    include: {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 rounded-xl border border-border bg-surface/94 p-5 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span aria-hidden="true" className="font-meta mb-3 block text-[0.6875rem] font-semibold tracking-[0.18em] text-accent">
            01 / BOOKING
          </span>
          <h1 className="font-display ui-balance text-4xl font-semibold tracking-[-0.04em]">
            {pickText(locale, event.titleEn, event.titleZh)}
          </h1>
          <p className="mt-1 text-xs text-fg-subtle">
            {t("timeZoneNotice", { timeZone: settings.timeZone })}
          </p>
          <p className="mt-1 text-sm text-fg-subtle">
            {[dateLabel, event.location || null].filter(Boolean).join(" · ")}
          </p>
          {description && (
            <p className="mt-3 whitespace-pre-line text-fg-muted">
              {description}
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-lg bg-surface px-3 py-2 text-xs text-fg-subtle">
          <span>{t("alreadyBooked")} </span>
          <Link
            href={`/book/${token}/check`}
            className="inline-flex min-h-8 items-center font-semibold text-fg-muted underline underline-offset-4 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
          >
            {t("checkBookingButton")}
          </Link>
        </div>
      </div>

      {!event.open ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-fg-subtle">
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
    </div>
  );
}
