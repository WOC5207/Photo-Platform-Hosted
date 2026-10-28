import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatSlotRange } from "@/lib/datetime";
import { getSiteSettings, resolveSubjectTerm } from "@/lib/settings";
import {
  isVisitorBookingEditWindowOpen,
  visitorBookingEditDeadline
} from "@/lib/booking";
import { wallClockNow } from "@/lib/timeZone";
import {
  ArchiveHeading,
  ArchivePage,
  LocalTimeRule
} from "@/components/booking/archive";
import styles from "@/components/booking/Archive.module.css";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import MyBookingDraw from "@/components/booking/MyBookingDraw";
import EditBookingForm from "@/components/booking/EditBookingForm";
import { cancelMyBooking } from "../../book/actions";
import { activeWinnerWhere } from "@/lib/lottery";

export const dynamic = "force-dynamic";

export default async function MyBookingPage({
  params,
  searchParams
}: {
  params: Promise<{ cancelToken: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { cancelToken } = await params;
  const { new: isNew } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("booking");
  const tc = await getTranslations("common");
  const t3 = await getTranslations("album3d");
  if (!/^[a-z0-9]+$/.test(cancelToken)) notFound();

  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    include: {
      lotteryEntry: { include: { wonPrize: true } },
      timeSlot: {
        include: {
          bookingEvent: {
            include: {
              owner: { select: { username: true } },
              lotteryDraw: {
                include: {
                  prizes: {
                    orderBy: { sortOrder: "asc" },
                    include: { _count: { select: { winners: { where: activeWinnerWhere } } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  if (!booking) notFound();

  const event = booking.timeSlot.bookingEvent;
  // Settings come from the event's owner (reached via the cancel token), not
  // from any site-wide row: this booking belongs to one photographer, and it is
  // their vocabulary and feature toggles that apply.
  const settings = await getSiteSettings(event.ownerId);
  const subjectTerm = resolveSubjectTerm(settings, locale, tc("subjectTerm"));
  const cancelled = booking.status === "cancelled";
  const editDeadline = visitorBookingEditDeadline(
    booking.timeSlot.startTime,
    event.visitorEditCutoffHours
  );
  const editWindowOpen =
    !cancelled &&
    event.visitorEditsEnabled &&
    isVisitorBookingEditWindowOpen(
      booking.timeSlot.startTime,
      event.visitorEditCutoffHours,
      settings.timeZone
    );
  const editDeadlineLabel = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(editDeadline);

  const editableSlots = editWindowOpen
    ? (
        await prisma.timeSlot.findMany({
          where: {
            bookingEventId: event.id,
            startTime: { gt: wallClockNow(settings.timeZone) }
          },
          include: {
            _count: {
              select: { bookings: { where: { status: "confirmed" } } }
            }
          },
          orderBy: { startTime: "asc" }
        })
      )
        .filter(
          (slot) =>
            slot.id === booking.timeSlotId ||
            (event.open &&
              settings.bookingEnabled &&
              slot._count.bookings < slot.capacity)
        )
        .map((slot) => {
          const description = pickText(
            locale,
            slot.descriptionEn,
            slot.descriptionZh
          );
          const price =
            settings.bookingPriceEnabled && slot.pricePerPerson
              ? t("pricePerPersonDisplay", { price: slot.pricePerPerson })
              : "";
          return {
            id: slot.id,
            label: [formatSlotRange(slot.startTime, slot.endTime), description, price]
              .filter(Boolean)
              .join(" · ")
          };
        })
    : [];

  // The wheel shows whenever the site + event have lottery on and a draw
  // (with its prizes) has been set up; enabling lottery is all it takes —
  // there's no separate "allow spinning" switch. A cancelled booking never
  // spins.
  const draw = event.lotteryDraw;
  const showWheel =
    settings.lotteryEnabled &&
    event.lotteryEnabled &&
    !!draw &&
    !cancelled;
  const wheelPrizes =
    draw?.prizes.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      weight: p.weight,
      wonCount: p._count.winners
    })) ?? [];

  const eventTitle = pickText(locale, event.titleEn, event.titleZh);
  const slotRange = formatSlotRange(
    booking.timeSlot.startTime,
    booking.timeSlot.endTime
  );

  return (
    <ArchivePage
      aside={
        <div className="flex flex-col gap-5">
          <ArchiveHeading
            crumbs={[`@${event.owner.username}`, t3("crumbMyBooking")]}
            title={t("yourBooking")}
            meta={[eventTitle, event.location || null].filter(Boolean).join(" · ")}
          />
          {isNew && !cancelled && (
            <p className="border-l-2 border-success bg-success-surface px-3 py-2 text-sm leading-6 text-success">
              {t("saveLinkNotice")}
            </p>
          )}
          {cancelled && (
            <p className="border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm leading-6 text-danger">
              {t("bookingCancelledNotice")}
            </p>
          )}
          <LocalTimeRule marker={t("eventLocalTimeMarker")}>
            {t("eventLocalTimeNotice")}
          </LocalTimeRule>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className={`${styles.board} ${styles.rise} p-4 sm:p-6`}>
          <div
            data-full={cancelled ? "" : undefined}
            className={`${styles.tile} flex flex-wrap items-center justify-between gap-4 py-5 pl-6 pr-5`}
          >
            <div className="min-w-0">
              <p className="font-meta text-[0.6875rem] uppercase tracking-[0.12em] text-accent-text">
                {slotRange}
              </p>
              <p className="mt-1 text-2xl font-extrabold uppercase leading-tight tracking-[-0.02em]">
                {eventTitle}
              </p>
              <p className="text-sm text-fg-muted">
                {[booking.name, booking.subject || null, event.location || null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <span
              aria-hidden="true"
              data-cancelled={cancelled ? "" : undefined}
              className={`${styles.stamp} font-meta text-sm font-bold uppercase tracking-[0.16em]`}
            >
              {cancelled ? t3("ticketStampCancelled") : t3("ticketStampBooked")}
            </span>
          </div>
        </div>

        <dl className="grid border border-border-strong text-sm">
          <Row label={t("eventLabel")}>
            {eventTitle}
            {event.location ? ` · ${event.location}` : ""}
          </Row>
          <Row label={t("timeLabel")}>
            <span className="font-meta">{slotRange}</span>
          </Row>
          {settings.bookingPriceEnabled && booking.timeSlot.pricePerPerson && (
            <Row label={t("pricePerPersonLabel")}>
              {booking.timeSlot.pricePerPerson}
            </Row>
          )}
          <Row label={t("nameLabel")}>{booking.name}</Row>
          {booking.subject && <Row label={subjectTerm}>{booking.subject}</Row>}
          <Row label={t("statusLabel")}>
            <span
              className={`font-meta text-xs font-semibold uppercase tracking-[0.14em] ${
                cancelled ? "text-danger" : "text-success"
              }`}
            >
              {cancelled ? t("statusCancelled") : t("statusConfirmed")}
            </span>
          </Row>
        </dl>

        {!cancelled && (
          <section className="flex flex-col gap-4" aria-labelledby="booking-edit-window">
            <div
              className={`border-l-2 px-4 py-3 ${
                editWindowOpen
                  ? "border-accent bg-accent-surface"
                  : "border-border-strong bg-surface"
              }`}
            >
              <p className="font-meta text-[0.6875rem] uppercase tracking-[0.14em] text-accent-text">
                {t("editWindowMarker")}
              </p>
              <h2 id="booking-edit-window" className="mt-1 font-bold text-fg">
                {editWindowOpen
                  ? t("editWindowOpenTitle")
                  : t("editWindowClosedTitle")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-fg-muted">
                {event.visitorEditsEnabled
                  ? editWindowOpen
                    ? t("editWindowOpenHint", {
                        deadline: editDeadlineLabel
                      })
                    : t("editWindowClosedHint", {
                        hours: event.visitorEditCutoffHours
                      })
                  : t("editWindowDisabledHint")}
              </p>
            </div>

            {editWindowOpen && (
              <EditBookingForm
                cancelToken={cancelToken}
                subjectTerm={subjectTerm}
                currentSlotId={booking.timeSlotId}
                slots={editableSlots}
                initial={{
                  name: booking.name,
                  subject: booking.subject,
                  contactValue: booking.contactValue,
                  email: booking.email,
                  notes: booking.notes
                }}
              />
            )}
          </section>
        )}

        {showWheel && (
          <MyBookingDraw
            cancelToken={cancelToken}
            prizes={wheelPrizes}
            alreadyWonPrizeName={booking.lotteryEntry?.wonPrize?.name ?? null}
          />
        )}

        {/* A booking that has won keeps its prize, so only the photographer
            can cancel it (see cancelBooking in publicBookingService). */}
        {!cancelled && booking.lotteryEntry?.wonPrize && (
          <p className="text-sm text-fg-muted">
            {t("cancelWithPrizeContactOwner", {
              prize: booking.lotteryEntry.wonPrize.name
            })}
          </p>
        )}
        {!cancelled && !booking.lotteryEntry?.wonPrize && (
          <form action={cancelMyBooking}>
            <input type="hidden" name="cancelToken" value={cancelToken} />
            <ConfirmSubmit
              label={t("cancelButton")}
              confirmText={t("confirmCancel")}
              className="inline-flex min-h-11 items-center gap-3 border border-danger-border px-4 text-sm uppercase tracking-[0.06em] text-danger transition hover:border-danger hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            />
          </form>
        )}
      </div>
    </ArchivePage>
  );
}

function Row({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="font-meta text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
