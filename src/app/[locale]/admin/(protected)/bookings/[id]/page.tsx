import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getSiteSettings } from "@/lib/settings";
import { pickText } from "@/lib/content";
import { formatSlotRange, formatDateTime } from "@/lib/datetime";
import BookingEventForm from "@/components/admin/BookingEventForm";
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
  const settings = await getSiteSettings(user.id);

  const event = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id },
    include: {
      slots: {
        orderBy: { startTime: "asc" },
        include: {
          bookings: { orderBy: { createdAt: "asc" } }
        }
      }
    }
  });
  if (!event) notFound();

  const shareUrl = `${config.appBaseUrl()}/${locale}/book/${event.token}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("editEvent")}</h1>
        <div className="flex items-center gap-3">
          {settings.lotteryEnabled && (
            <>
              <LotteryEnabledToggle
                bookingEventId={event.id}
                defaultEnabled={event.lotteryEnabled}
                label={t("lotteryEnabledLabel")}
              />
              {event.lotteryEnabled && (
                <Link
                  href={`/admin/bookings/${event.id}/lottery`}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-fg-muted transition hover:border-fg-faint hover:text-fg"
                >
                  {t("lotteryTool")}
                </Link>
              )}
            </>
          )}
          <form action={deleteBookingEvent}>
            <input type="hidden" name="id" value={event.id} />
            <ConfirmSubmit
              label={t("deleteEvent")}
              confirmText={t("confirmDeleteEvent")}
            />
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t("shareLink")}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="break-all rounded-md bg-page px-3 py-2 text-xs text-success">
            {shareUrl}
          </code>
          <CopyButton text={shareUrl} />
        </div>
        <p className="mt-2 text-xs text-fg-subtle">{t("shareLinkHint")}</p>
      </div>

      <BookingEventForm
        action={updateBookingEvent}
        submitLabel={tc("save")}
        initial={{
          id: event.id,
          titleEn: event.titleEn,
          titleZh: event.titleZh,
          date: event.date.toISOString().slice(0, 10),
          location: event.location,
          descriptionEn: event.descriptionEn,
          descriptionZh: event.descriptionZh,
          open: event.open
        }}
      />

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-xl font-semibold">{t("slots")}</h2>

        {event.slots.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noSlots")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {event.slots.map((slot) => {
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
                              {b.subject ? `${b.name} · ${b.subject}` : b.name}
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

        <SlotAdder eventId={event.id} />
      </section>
    </div>
  );
}
