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
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import MyBookingDraw from "@/components/booking/MyBookingDraw";
import EditBookingForm from "@/components/booking/EditBookingForm";
import { cancelMyBooking } from "../../book/actions";

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
  if (!/^[a-z0-9]+$/.test(cancelToken)) notFound();

  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    include: {
      lotteryEntry: { include: { wonPrize: true } },
      timeSlot: {
        include: {
          bookingEvent: {
            include: {
              lotteryDraw: {
                include: {
                  prizes: {
                    orderBy: { sortOrder: "asc" },
                    include: { _count: { select: { winners: true } } }
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("yourBooking")}</h1>

      {isNew && !cancelled && (
        <p className="rounded-xl border border-success-border bg-success-surface p-4 text-sm text-success">
          {t("saveLinkNotice")}
        </p>
      )}
      {cancelled && (
        <p className="rounded-xl border border-danger-border bg-danger-surface p-4 text-sm text-danger">
          {t("bookingCancelledNotice")}
        </p>
      )}

      <dl className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-sm">
        <Row label={t("eventLabel")}>
          {pickText(locale, event.titleEn, event.titleZh)}
          {event.location ? ` · ${event.location}` : ""}
        </Row>
        <Row label={t("timeLabel")}>
          <span className="font-mono">
            {formatSlotRange(booking.timeSlot.startTime, booking.timeSlot.endTime)}
          </span>
          <span className="ml-2 text-xs text-fg-subtle">
            ({settings.timeZone})
          </span>
        </Row>
        {settings.bookingPriceEnabled && booking.timeSlot.pricePerPerson && (
          <Row label={t("pricePerPersonLabel")}>
            {booking.timeSlot.pricePerPerson}
          </Row>
        )}
        <Row label={t("nameLabel")}>{booking.name}</Row>
        {booking.subject && <Row label={subjectTerm}>{booking.subject}</Row>}
        <Row label={t("statusLabel")}>
          <span className={cancelled ? "text-danger" : "text-success"}>
            {cancelled ? t("statusCancelled") : t("statusConfirmed")}
          </span>
        </Row>
      </dl>

      {!cancelled && (
        <section className="flex flex-col gap-3" aria-labelledby="booking-edit-window">
          <div
            className={`rounded-xl border p-4 ${
              editWindowOpen
                ? "border-accent/25 bg-accent-surface"
                : "border-border bg-surface"
            }`}
          >
            <p className="font-meta text-[0.6875rem] uppercase tracking-[0.14em] text-accent">
              {t("editWindowMarker")}
            </p>
            <h2 id="booking-edit-window" className="mt-1 font-semibold text-fg">
              {editWindowOpen
                ? t("editWindowOpenTitle")
                : t("editWindowClosedTitle")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-fg-subtle">
              {event.visitorEditsEnabled
                ? editWindowOpen
                  ? t("editWindowOpenHint", {
                      deadline: editDeadlineLabel,
                      timeZone: settings.timeZone
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

      {!cancelled && (
        <form action={cancelMyBooking}>
          <input type="hidden" name="cancelToken" value={cancelToken} />
          <ConfirmSubmit
            label={t("cancelButton")}
            confirmText={t("confirmCancel")}
          />
        </form>
      )}
    </div>
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
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-24 shrink-0 text-fg-subtle">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
