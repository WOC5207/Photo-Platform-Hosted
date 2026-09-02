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
  formatSlotRange
} from "@/lib/datetime";
import { formatInstantInTimeZone } from "@/lib/timeZone";
import BookingEventForm from "@/components/admin/BookingEventForm";
import BookingDayTabs, { type DayTab } from "@/components/admin/BookingDayTabs";
import BookingEventSplit from "@/components/admin/BookingEventSplit";
import SlotAdder from "@/components/admin/SlotAdder";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import CopyButton from "@/components/admin/CopyButton";
import BookingStatusButton from "@/components/admin/BookingStatusButton";
import LotteryEnabledToggle from "@/components/admin/LotteryEnabledToggle";
import { Link } from "@/i18n/navigation";
import {
  createDailyEquipmentChecklist,
  deleteBookingEvent,
  deleteSlot,
  updateBookingEvent
} from "../actions";
import {
  addCustomChecklistItem,
  addEquipmentToChecklist,
  deleteChecklist,
  removeChecklistItem,
  resetChecklist,
  toggleChecklistItem
} from "../../equipment/actions";

const inputClasses =
  "min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

export default async function EditBookingEventPage({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations("adminBookings");
  const te = await getTranslations("equipment");
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
          equipmentChecklist: {
            include: {
              items: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                include: { equipment: true }
              }
            }
          },
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
  const equipment = await prisma.equipmentItem.findMany({
    where: { ownerId: user.id },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    include: { category: true }
  });

  const shareUrl = `${config.appBaseUrl()}/${locale}/book/${event.token}`;
  const showLotteryManagement =
    settings.lotteryEnabled || event.lotteryEnabled || !!event.lotteryDraw;
  const allowMultiDaySlotSync =
    event.days.length > 1 &&
    !event.slotsInitialized &&
    event.days.every((day) => day.slots.length === 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/dashboard/bookings"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("listTitle")}
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("editEvent")}</h1>
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
        timeZone={settings.timeZone}
        initial={{
          id: event.id,
          titleEn: event.titleEn,
          titleZh: event.titleZh,
          dates: event.days.map((day) => formatDate(day.date)),
          location: event.location,
          descriptionEn: event.descriptionEn,
          descriptionZh: event.descriptionZh,
          visitorEditsEnabled: event.visitorEditsEnabled,
          visitorEditCutoffHours: event.visitorEditCutoffHours,
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
          label={t("daysLabel")}
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
                              <p className="font-meta text-sm font-semibold">
                                {formatSlotRange(slot.startTime, slot.endTime)}
                                <span className="ml-3 font-sans font-normal text-fg-subtle">
                                  {t("booked", {
                                    booked: confirmed.length,
                                    capacity: slot.capacity
                                  })}
                                </span>
                                {settings.bookingPriceEnabled &&
                                  slot.pricePerPerson && (
                                  <span className="ml-3 font-sans font-medium text-fg-muted">
                                    {t("pricePerPersonDisplay", {
                                      price: slot.pricePerPerson
                                    })}
                                  </span>
                                )}
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
                                        {t("bookedAt")}:{" "}
                                        {formatInstantInTimeZone(
                                          b.createdAt,
                                          locale,
                                          settings.timeZone
                                        )}
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

                  <SlotAdder
                    bookingDayId={day.id}
                    allowMultiDaySync={allowMultiDaySlotSync}
                    priceEnabled={settings.bookingPriceEnabled}
                  />
                </div>
              )
            })
          )}
        />
      </section>

      <section className="flex flex-col gap-5 border-t border-border pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("dailyEquipmentTitle")}</h2>
            <p className="mt-1 text-sm text-fg-subtle">{t("dailyEquipmentHint")}</p>
          </div>
          <Link
            href="/dashboard/equipment/manage"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11"
          >
            {te("manageInventory")}
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {event.days.map((day) => {
            const checklist = day.equipmentChecklist;
            const completed = checklist?.items.filter((item) => item.checked).length ?? 0;
            const total = checklist?.items.length ?? 0;
            const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

            return (
              <article key={day.id} className="rounded-xl border border-border bg-surface p-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                      {t("dailyChecklistLabel")}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-semibold">
                      {formatDayTab(day.date, locale)}
                    </h3>
                  </div>
                  {checklist && (
                    <span className="rounded-full bg-control px-3 py-1 text-xs font-semibold text-fg-muted">
                      {te("progress", { completed, total })}
                    </span>
                  )}
                </header>

                {!checklist ? (
                  <div className="mt-5 rounded-lg border border-dashed border-border p-4">
                    <p className="text-sm text-fg-subtle">{t("noDailyChecklist")}</p>
                    <form action={createDailyEquipmentChecklist} className="mt-3">
                      <input type="hidden" name="bookingDayId" value={day.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-transparent bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 max-sm:min-h-11"
                      >
                        {t("createDailyChecklist")}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-4">
                    <div className="h-2 overflow-hidden rounded-full bg-control" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-accent transition-[width]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {total === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-fg-subtle">
                        {te("emptyChecklistItems")}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {checklist.items.map((item) => (
                          <li key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-control p-2">
                            <form action={toggleChecklistItem} className="min-w-0 flex-1">
                              <input type="hidden" name="id" value={item.id} />
                              <input type="hidden" name="checked" value={String(!item.checked)} />
                              <button
                                type="submit"
                                role="checkbox"
                                aria-checked={item.checked}
                                className="flex w-full items-center gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                                    item.checked
                                      ? "border-accent bg-accent text-accent-fg"
                                      : "border-border-strong bg-surface"
                                  }`}
                                >
                                  {item.checked ? "✓" : ""}
                                </span>
                                <span className={`min-w-0 flex-1 ${item.checked ? "text-fg-subtle line-through" : "text-fg"}`}>
                                  {item.label}
                                </span>
                                {item.equipment && (
                                  <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-accent">
                                    {te("inventoryItem")}
                                  </span>
                                )}
                              </button>
                            </form>
                            <form action={removeChecklistItem}>
                              <input type="hidden" name="id" value={item.id} />
                              <button
                                type="submit"
                                aria-label={te("removeItem", { name: item.label })}
                                className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                              >
                                ×
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                      <form action={addEquipmentToChecklist} className="flex gap-2">
                        <input type="hidden" name="checklistId" value={checklist.id} />
                        <label className="sr-only" htmlFor={`daily-equipment-${day.id}`}>
                          {te("chooseEquipment")}
                        </label>
                        <select
                          id={`daily-equipment-${day.id}`}
                          name="equipmentId"
                          required
                          disabled={equipment.length === 0}
                          className={inputClasses}
                          defaultValue=""
                        >
                          <option value="" disabled>{te("chooseEquipment")}</option>
                          {equipment.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.category.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={equipment.length === 0}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-45 max-sm:min-h-11"
                        >
                          {te("add")}
                        </button>
                      </form>
                      <form action={addCustomChecklistItem} className="flex gap-2">
                        <input type="hidden" name="checklistId" value={checklist.id} />
                        <label className="sr-only" htmlFor={`daily-custom-${day.id}`}>
                          {te("customItem")}
                        </label>
                        <input
                          id={`daily-custom-${day.id}`}
                          name="label"
                          required
                          maxLength={200}
                          placeholder={te("customItem")}
                          className={inputClasses}
                        />
                        <button
                          type="submit"
                          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg max-sm:min-h-11"
                        >
                          {te("add")}
                        </button>
                      </form>
                    </div>

                    <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
                      <form action={resetChecklist}>
                        <input type="hidden" name="checklistId" value={checklist.id} />
                        <button
                          type="submit"
                          disabled={completed === 0}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-45 max-sm:min-h-11"
                        >
                          {te("resetChecklist")}
                        </button>
                      </form>
                      <form action={deleteChecklist}>
                        <input type="hidden" name="id" value={checklist.id} />
                        <ConfirmSubmit
                          label={te("deleteChecklist")}
                          confirmText={t("deleteDailyChecklistConfirm", {
                            date: formatDayTab(day.date, locale)
                          })}
                        />
                      </form>
                    </footer>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {event.days.length >= 2 && (
        <BookingEventSplit
          eventId={event.id}
          days={event.days.map((day) => ({
            id: day.id,
            label: formatDayTab(day.date, locale)
          }))}
        />
      )}

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
