"use client";

import {
  useActionState,
  useId,
  useMemo,
  useState,
  type KeyboardEvent
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  createBooking,
  type BookingFormState
} from "@/app/[locale]/(public)/book/actions";

export interface PublicSlot {
  id: string;
  start: string; // ISO, naive-as-UTC
  end: string;
  remaining: number;
  pricePerPerson: string;
  description: string;
}

export interface PublicDay {
  id: string;
  date: string; // yyyy-mm-dd
  slots: PublicSlot[];
}

type CartSlot = PublicSlot & { date: string };

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

function slotTime(slot: PublicSlot): string {
  return `${slot.start.slice(11, 16)}–${slot.end.slice(11, 16)}`;
}

export default function BookingForm({
  days,
  subjectTerm,
  eventToken
}: {
  days: PublicDay[];
  subjectTerm: string;
  eventToken: string;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    BookingFormState,
    FormData
  >(createBooking, {});
  const [step, setStep] = useState<"slots" | "review">("slots");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [details, setDetails] = useState({
    name: "",
    subject: "",
    contactValue: "",
    email: "",
    notes: ""
  });
  const tabsId = useId().replace(/:/g, "");

  const [activeDayId, setActiveDayId] = useState(
    () =>
      (
        days.find((d) => d.slots.some((slot) => slot.remaining > 0)) ??
        days.find((d) => d.slots.length > 0) ??
        days[0]
      )?.id ?? ""
  );
  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0];
  const hasAvailableSlot = days.some((day) =>
    day.slots.some((slot) => slot.remaining > 0)
  );
  const slotById = useMemo(
    () =>
      new Map(
        days.flatMap((day) =>
          day.slots.map((slot) => [
            slot.id,
            { ...slot, date: day.date } satisfies CartSlot
          ])
        )
      ),
    [days]
  );
  const selectedSlots = selectedSlotIds
    .map((id) => slotById.get(id))
    .filter((slot): slot is CartSlot => Boolean(slot));

  function selectDay(index: number, focus = false) {
    const day = days[index];
    if (!day) return;
    setActiveDayId(day.id);
    if (focus) {
      requestAnimationFrame(() => {
        document.getElementById(`${tabsId}-tab-${index}`)?.focus();
      });
    }
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % days.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + days.length) % days.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = days.length - 1;
    else return;
    event.preventDefault();
    selectDay(next, true);
  }

  function toggleSlot(slotId: string) {
    setSelectedSlotIds((current) =>
      current.includes(slotId)
        ? current.filter((id) => id !== slotId)
        : current.length < 20
          ? [...current, slotId]
          : current
    );
  }

  function removeSlot(slotId: string) {
    setSelectedSlotIds((current) => current.filter((id) => id !== slotId));
  }

  const errorMessage = state.error
    ? {
        validation: t("errorValidation"),
        slotFull: t("errorSlotFull"),
        slotUnavailable: t("errorSlotUnavailable"),
        rateLimited: t("errorRateLimited"),
        closed: t("errorClosed")
      }[state.error]
    : null;

  if (state.bookings && state.bookings.length > 0) {
    return (
      <section className="flex flex-col gap-5" aria-labelledby="booking-complete">
        <div className="rounded-xl border border-success/30 bg-success-surface p-5">
          <h2 id="booking-complete" className="text-xl font-semibold text-success">
            {t("batchConfirmedTitle")}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {t("batchConfirmedHint", { count: state.bookings.length })}
          </p>
        </div>
        <ol className="flex flex-col gap-3">
          {state.bookings.map((booking, index) => {
            const slot = slotById.get(booking.slotId);
            return (
              <li
                key={booking.cancelToken}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface p-4"
              >
                <div>
                  <p className="font-semibold">
                    {slot
                      ? `${dayLabel(slot.date, locale)} · ${slotTime(slot)}`
                      : t("bookingNumber", { number: index + 1 })}
                  </p>
                  {slot?.description && (
                    <p className="text-sm text-fg-subtle">{slot.description}</p>
                  )}
                </div>
                <Link
                  href={`/my-booking/${booking.cancelToken}?new=1`}
                  className="inline-flex min-h-10 items-center rounded-full border border-border-strong px-4 text-sm font-semibold transition hover:border-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                >
                  {t("manageBooking")}
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-fg-subtle">{t("saveBatchLinksNotice")}</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="eventToken" value={eventToken} />
      {selectedSlotIds.map((slotId) => (
        <input key={slotId} type="hidden" name="slotIds" value={slotId} />
      ))}

      <nav aria-label={t("bookingSteps")} className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setStep("slots")}
          aria-current={step === "slots" ? "step" : undefined}
          className={`rounded-lg border px-3 py-2 text-left text-sm ${
            step === "slots"
              ? "border-fg bg-surface-2 font-semibold"
              : "border-border text-fg-subtle"
          }`}
        >
          <span className="block text-xs">{t("step", { number: 1 })}</span>
          {t("selectSlotsStep")}
        </button>
        <button
          type="button"
          onClick={() => selectedSlotIds.length > 0 && setStep("review")}
          disabled={selectedSlotIds.length === 0}
          aria-current={step === "review" ? "step" : undefined}
          className={`rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${
            step === "review"
              ? "border-fg bg-surface-2 font-semibold"
              : "border-border text-fg-subtle"
          }`}
        >
          <span className="block text-xs">{t("step", { number: 2 })}</span>
          {t("reviewStep")}
        </button>
      </nav>

      {step === "slots" ? (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-lg font-semibold">
              {t("chooseSlots")}
            </legend>
            <p className="-mt-2 text-sm text-fg-subtle">{t("chooseSlotsHint")}</p>

            {days.length > 1 && (
              <div
                role="tablist"
                aria-label={t("chooseDay")}
                className="flex flex-wrap gap-2"
              >
                {days.map((day, index) => {
                  const selected = day.id === activeDay?.id;
                  const cartCount = day.slots.filter((slot) =>
                    selectedSlotIds.includes(slot.id)
                  ).length;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      role="tab"
                      id={`${tabsId}-tab-${index}`}
                      aria-controls={`${tabsId}-panel`}
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActiveDayId(day.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                      className={[
                        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11",
                        selected
                          ? "border-fg bg-fg text-page"
                          : "border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
                      ].join(" ")}
                    >
                      {dayLabel(day.date, locale)}
                      {cartCount > 0 && (
                        <span
                          className={`rounded-full px-1.5 text-xs ${
                            selected ? "bg-page/20" : "bg-surface-2"
                          }`}
                          aria-label={t("selectedOnDay", { count: cartCount })}
                        >
                          {cartCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div
              role={days.length > 1 ? "tabpanel" : undefined}
              id={activeDay ? `${tabsId}-panel` : undefined}
              aria-labelledby={
                days.length > 1 && activeDay
                  ? `${tabsId}-tab-${days.findIndex((day) => day.id === activeDay.id)}`
                  : undefined
              }
              className="flex flex-col gap-3"
            >
              {!activeDay || activeDay.slots.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-fg-subtle">
                  {t("noSlotsThisDay")}
                </p>
              ) : (
                activeDay.slots.map((slot) => {
                  const full = slot.remaining === 0;
                  const selected = selectedSlotIds.includes(slot.id);
                  return (
                    <article
                      key={slot.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-4 transition ${
                        full
                          ? "border-border bg-surface/50 text-fg-faint"
                          : selected
                            ? "border-fg bg-surface-2"
                            : "border-border-strong bg-surface"
                      }`}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="font-mono text-sm">{slotTime(slot)}</span>
                        {slot.description && (
                          <span className="text-xs text-fg-subtle">
                            {slot.description}
                          </span>
                        )}
                        {slot.pricePerPerson && (
                          <span className="text-xs font-medium text-fg-muted">
                            {t("pricePerPersonDisplay", {
                              price: slot.pricePerPerson
                            })}
                          </span>
                        )}
                        <span
                          className={`mt-1 text-xs ${full ? "" : "text-success"}`}
                        >
                          {full
                            ? t("full")
                            : t("slotsLeft", { count: slot.remaining })}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={full || pending}
                        aria-pressed={selected}
                        onClick={() => toggleSlot(slot.id)}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? "border border-border-strong bg-surface text-fg"
                            : "bg-fg text-page hover:opacity-90"
                        }`}
                      >
                        {selected ? t("removeFromCart") : t("addToCart")}
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </fieldset>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fg/20 bg-page/95 p-3 shadow-lg backdrop-blur">
            <div>
              <p className="text-sm font-semibold">
                {t("cartCount", { count: selectedSlotIds.length })}
              </p>
              <p className="text-xs text-fg-subtle">{t("cartHint")}</p>
            </div>
            <button
              type="button"
              disabled={!hasAvailableSlot || selectedSlotIds.length === 0}
              onClick={() => {
                setStep("review");
                requestAnimationFrame(() =>
                  document.getElementById("booking-review")?.focus()
                );
              }}
              className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
            >
              {t("reviewCart", { count: selectedSlotIds.length })}
            </button>
          </div>
        </>
      ) : (
        <section
          id="booking-review"
          tabIndex={-1}
          className="flex flex-col gap-6 outline-none"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t("reviewTitle")}</h2>
              <button
                type="button"
                onClick={() => setStep("slots")}
                className="text-sm font-semibold underline underline-offset-4"
              >
                {t("addMoreSlots")}
              </button>
            </div>
            <ol className="flex flex-col gap-2">
              {selectedSlots.map((slot) => (
                <li
                  key={slot.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border bg-surface p-4 ${
                    state.failedSlotId === slot.id
                      ? "border-danger"
                      : "border-border-strong"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {dayLabel(slot.date, locale)} · {slotTime(slot)}
                    </p>
                    {slot.description && (
                      <p className="text-sm text-fg-subtle">{slot.description}</p>
                    )}
                    {slot.pricePerPerson && (
                      <p className="text-xs text-fg-muted">
                        {t("pricePerPersonDisplay", {
                          price: slot.pricePerPerson
                        })}
                      </p>
                    )}
                    {state.failedSlotId === slot.id && (
                      <p className="mt-1 text-xs font-semibold text-danger">
                        {t("slotNeedsAttention")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => removeSlot(slot.id)}
                    className="shrink-0 text-sm font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
                  >
                    {t("remove")}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-lg font-semibold">
              {t("yourDetails")}
            </legend>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("name")} *</span>
              <input
                name="name"
                required
                maxLength={200}
                autoComplete="name"
                value={details.name}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">
                {t("subject", { term: subjectTerm })}
              </span>
              <input
                name="subject"
                maxLength={200}
                value={details.subject}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    subject: event.target.value
                  }))
                }
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("contactValue")} *</span>
              <input
                name="contactValue"
                required
                maxLength={200}
                value={details.contactValue}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    contactValue: event.target.value
                  }))
                }
                className={inputCls}
              />
              <span className="text-xs text-fg-subtle">{t("contactHint")}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("email")}</span>
              <input
                name="email"
                type="email"
                maxLength={200}
                autoComplete="email"
                value={details.email}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    email: event.target.value
                  }))
                }
                className={inputCls}
              />
              <span className="text-xs text-fg-subtle">{t("emailHint")}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("notes")}</span>
              <textarea
                name="notes"
                rows={3}
                maxLength={2000}
                placeholder={t("notesPlaceholder")}
                value={details.notes}
                onChange={(event) =>
                  setDetails((current) => ({
                    ...current,
                    notes: event.target.value
                  }))
                }
                className={inputCls}
              />
            </label>
          </fieldset>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger"
            >
              {errorMessage}
            </p>
          )}

          <div className="flex flex-wrap-reverse items-center justify-between gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => setStep("slots")}
              className="rounded-full border border-border-strong px-5 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {t("backToSlots")}
            </button>
            <button
              type="submit"
              disabled={pending || selectedSlotIds.length === 0}
              className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
            >
              {pending
                ? t("bookingInProgress")
                : t("confirmBookings", { count: selectedSlotIds.length })}
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
