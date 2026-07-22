import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getSiteSettings } from "@/lib/settings";
import { pickText } from "@/lib/content";
import {
  formatDate,
  formatDayTab,
  formatSlotRange,
  formatDateTime
} from "@/lib/datetime";
import BookingEventForm from "@/components/admin/BookingEventForm";
import BookingDayTabs, { type DayTab } from "@/components/admin/BookingDayTabs";
import SlotAdder from "@/components/admin/SlotAdder";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import CopyButton from "@/components/admin/CopyButton";
import BookingStatusButton from "@/components/admin/BookingStatusButton";
import LotteryEnabledToggle from "@/components/admin/LotteryEnabledToggle";
import { Link } from "@/i18n/navigation";
import {
  deleteBookingEvent,
  deleteSlot,
  updateBookingEvent
} from "../actions";

export default async function EditBookingEventPage({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations("adminBookings");
  const tc = await getTranslations("common");
  const ts = await getTranslations("adminSite");
  const settings = await getSiteSettings(user.id);

  const event = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id },
    include: {
      lotteryDraw: { select: { id: true } },
      days: {
        orderBy: { date: "asc" },
        include: {
          slots: {
            orderBy: { startTime: "asc" },
            include: {
              bookings: { orderBy: { createdAt: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!event) notFound();

  const shareUrl = `${config.appBaseUrl()}/${locale}/book/${event.token}`;
  const showLotteryManagement =
    settings.lotteryEnabled || event.lotteryEnabled || !!event.lotteryDraw;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/dashboard/bookings"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("listTitle")}
        </Link>
        <h1 className="text-2xl font-bold">{t("editEvent")}</h1>
      </div>

      {!settings.bookingEnabled && (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-subtle"
        >
          <strong className="font-semibold text-fg-muted">{t("offPublicly")}.</strong>{" "}
          {ts("groupBookingHint")}
        </p>
      )}

      {!settings.lotteryEnabled && showLotteryManagement && (
        <p
          role="status"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-subtle"
        >
          <strong className="font-semibold text-fg-muted">{t("offPublicly")}.</strong>{" "}
          {ts("groupLotteryHint")}
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t("shareLink")}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="break-all rounded-md bg-page px-3 py-2 text-xs text-success">
            {shareUrl}
          </code>
          <CopyButton text={shareUrl} label={tc("copyLink")} copiedLabel={tc("copied")} />
        </div>
        <p className="mt-2 text-xs text-fg-subtle">{t("shareLinkHint")}</p>
      </div>

      <BookingEventForm
        action={updateBookingEvent}
        submitLabel={tc("save")}
        cancelHref="/dashboard/bookings"
        initial={{
          id: event.id,
          titleEn: event.titleEn,
          titleZh: event.titleZh,
          dates: event.days.map((day) => formatDate(day.date)),
          location: event.location,
          descriptionEn: event.descriptionEn,
          descriptionZh: event.descriptionZh,
          open: event.open
        }}
      />

      {showLotteryManagement && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("lotteryTool")}</h2>
              <p className="mt-1 text-sm text-fg-subtle">{ts("groupLotteryHint")}</p>
            </div>
            {(event.lotteryEnabled || event.lotteryDraw) && (
              <Link
                href={`/dashboard/bookings/${event.id}/lottery`}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11"
              >
                {t("lotteryTool")}
              </Link>
            )}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <LotteryEnabledToggle
              bookingEventId={event.id}
              defaultEnabled={event.lotteryEnabled}
              label={t("lotteryEnabledLabel")}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">{t("slots")}</h2>

        <BookingDayTabs
          tabs={event.days.map(
            (day): DayTab => ({
              id: day.id,
              label: formatDayTab(day.date, locale),
              content: (
                <div className="flex flex-col gap-4">
                  {day.slots.length === 0 ? (
                    <p className="text-sm text-fg-subtle">{t("noSlotsThisDay")}</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {day.slots.map((slot) => {
                        const confirmed = slot.bookings.filter(
                          (b) => b.status === "confirmed"
                        );
                        const description = pickText(
                          locale,
                          slot.descriptionEn,
                          slot.descriptionZh
                        );
                        return (
                          <li
                            key={slot.id}
                            className="rounded-xl border border-border bg-surface p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-mono text-sm font-semibold">
                                {formatSlotRange(slot.startTime, slot.endTime)}
                                <span className="ml-3 font-sans font-normal text-fg-subtle">
                                  {t("booked", {
                                    booked: confirmed.length,
                                    capacity: slot.capacity
                                  })}
                                </span>
                                {description && (
                                  <span className="ml-3 font-sans font-normal text-fg-subtle">
                                    · {description}
                                  </span>
                                )}
                              </p>
                              <form action={deleteSlot}>
                                <input type="hidden" name="slotId" value={slot.id} />
                                <ConfirmSubmit
                                  label={t("deleteSlot")}
                                  confirmText={t("confirmDeleteSlot")}
                                />
                              </form>
                            </div>

                            {slot.bookings.length > 0 && (
                              <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                                {slot.bookings.map((b) => (
                                  <li
                                    key={b.id}
                                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                  >
                                    <div
                                      className={
                                        b.status === "cancelled"
                                          ? "text-fg-faint line-through"
                                          : ""
                                      }
                                    >
                                      <span className="font-semibold">
                                        {b.subject
                                          ? `${b.name} · ${b.subject}`
                                          : b.name}
                                      </span>
                                      <span className="ml-2 text-fg-subtle">
                                        {[b.contactMethod, b.contactValue]
                                          .filter(Boolean)
                                          .join(": ")}
                                      </span>
                                      {b.notes && (
                                        <p className="mt-0.5 max-w-xl whitespace-pre-line text-xs text-fg-subtle">
                                          {b.notes}
                                        </p>
                                      )}
                                      <p className="text-xs text-fg-subtle">
                                        {t("bookedAt")}: {formatDateTime(b.createdAt)}
                                      </p>
                                    </div>
                                    <BookingStatusButton
                                      bookingId={b.id}
                                      status={b.status}
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <SlotAdder bookingDayId={day.id} />
                </div>
              )
            })
          )}
        />
      </section>

      <section className="rounded-xl border border-danger-border bg-danger-surface/40 p-5">
        <h2 className="text-lg font-semibold text-danger-strong">{tc("dangerZone")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("confirmDeleteEvent")}</p>
        <form action={deleteBookingEvent} className="mt-4">
          <input type="hidden" name="id" value={event.id} />
          <ConfirmSubmit
            label={t("deleteEvent")}
            confirmText={t("confirmDeleteEvent")}
          />
        </form>
      </section>
    </div>
  );
}
