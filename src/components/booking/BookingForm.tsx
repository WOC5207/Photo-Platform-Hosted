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
import {
  fieldClass,
  metaLabel,
  primaryClass,
  secondaryClass
} from "./classes";
import { SeatPips } from "./archive";
import styles from "./Archive.module.css";

export interface PublicSlot {
  id: string;
  start: string; // ISO, naive-as-UTC
  end: string;
  remaining: number;
  capacity: number;
  pricePerPerson: string;
  description: string;
}

export interface PublicDay {
  id: string;
  date: string; // yyyy-mm-dd
  slots: PublicSlot[];
}

type CartSlot = PublicSlot & { date: string };

const CART_LIMIT = 20;

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
  const t3 = useTranslations("album3d");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    BookingFormState,
    FormData
  >(createBooking, {});
  const [step, setStep] = useState<"slots" | "review">("slots");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [subjectsBySlot, setSubjectsBySlot] = useState<Record<string, string>>(
    {}
  );
  const [details, setDetails] = useState({
    name: "",
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
  const cartAtLimit = selectedSlotIds.length >= CART_LIMIT;

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
        : current.length < CART_LIMIT
          ? [...current, slotId]
          : current
    );
  }

  function removeSlot(slotId: string) {
    setSelectedSlotIds((current) => current.filter((id) => id !== slotId));
    setSubjectsBySlot((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
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
      <section
        className={`${styles.rise} flex flex-col gap-5`}
        aria-labelledby="booking-complete"
      >
        <div>
          <p className={metaLabel}>{t3("bookedKicker")}</p>
          <h2
            id="booking-complete"
            className="mt-2 text-2xl font-extrabold uppercase tracking-[-0.03em] sm:text-3xl"
          >
            {t("batchConfirmedTitle")}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {t("batchConfirmedHint", { count: state.bookings.length })}
          </p>
        </div>
        <ol className={`${styles.board} grid gap-4 p-4 sm:p-6`}>
          {state.bookings.map((booking, index) => {
            const slot = slotById.get(booking.slotId);
            return (
              <li
                key={booking.cancelToken}
                className={`${styles.tile} flex flex-wrap items-center justify-between gap-4 py-4 pl-6 pr-4`}
              >
                <div className="min-w-0">
                  <p className="font-meta text-[0.625rem] uppercase tracking-[0.14em] text-accent-text">
                    {t3("stampLabel", { number: pad(index + 1) })}
                  </p>
                  <p className="font-meta mt-1 text-lg">
                    {slot
                      ? `${dayLabel(slot.date, locale)} · ${slotTime(slot)}`
                      : t("bookingNumber", { number: index + 1 })}
                  </p>
                  {slot?.description && (
                    <p className="text-xs text-fg-muted">{slot.description}</p>
                  )}
                </div>
                <span className="flex items-center gap-5">
                  <span
                    aria-hidden="true"
                    className={`${styles.stamp} font-meta text-xs font-bold uppercase tracking-[0.16em]`}
                  >
                    {t3("ticketStampBooked")}
                  </span>
                  <Link
                    href={`/my-booking/${booking.cancelToken}?new=1`}
                    className={secondaryClass}
                  >
                    {t("manageBooking")} <span aria-hidden="true">→</span>
                  </Link>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="border-l-2 border-accent pl-3 text-xs leading-5 text-fg-muted">
          {t("saveBatchLinksNotice")}
        </p>
      </section>
    );
  }

  // Checked after the confirmation above: the cart that just succeeded may have
  // taken the event's last openings.
  if (!hasAvailableSlot) {
    return (
      <p className={`${styles.board} p-8 text-center text-sm text-fg-muted`}>
        {t("noSlotsNotice")}
      </p>
    );
  }

  const steps = [
    { key: "slots", label: t("selectSlotsStep") },
    { key: "review", label: t("reviewStep") }
  ] as const;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="eventToken" value={eventToken} />
      {selectedSlotIds.map((slotId) => (
        <input key={slotId} type="hidden" name="slotIds" value={slotId} />
      ))}

      <nav
        aria-label={t("bookingSteps")}
        className="relative grid grid-cols-2 border-b border-border-strong"
      >
        {steps.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() =>
              item.key === "slots"
                ? setStep("slots")
                : selectedSlotIds.length > 0 && setStep("review")
            }
            disabled={item.key === "review" && selectedSlotIds.length === 0}
            aria-current={step === item.key ? "step" : undefined}
            className={`flex min-h-12 items-baseline gap-3 py-3 pr-2 text-left transition-colors disabled:opacity-40 ${
              step === item.key ? "text-fg" : "text-fg-subtle hover:text-fg"
            }`}
          >
            <span className="font-meta text-[0.6875rem] tracking-[0.14em]">
              {pad(index + 1)}
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.06em]">
              <span className="sr-only">{t("step", { number: index + 1 })}: </span>
              {item.label}
            </span>
          </button>
        ))}
        <span
          aria-hidden="true"
          className={`${styles.stepMarker} absolute -bottom-px left-0 h-[2px] w-1/2 bg-fg ${
            step === "review" ? "translate-x-full" : ""
          }`}
        />
      </nav>

      {step === "slots" ? (
        <div className={`${styles.rise} flex flex-col gap-5`}>
          <fieldset
            aria-labelledby="booking-choose-slots"
            className="flex flex-col gap-4"
          >
            <div>
              <h2
                id="booking-choose-slots"
                className="text-xl font-bold uppercase tracking-[-0.01em]"
              >
                {t("chooseSlots")}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">{t("chooseSlotsHint")}</p>
            </div>

            {days.length > 1 && (
              <div
                role="tablist"
                aria-label={t("chooseDay")}
                className="flex flex-wrap gap-1"
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
                      className={`font-meta inline-flex min-h-11 items-center gap-2 px-3 text-[0.6875rem] uppercase tracking-[0.1em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        selected
                          ? "bg-fg text-page"
                          : "border border-border-strong hover:border-fg"
                      }`}
                    >
                      {dayLabel(day.date, locale)}
                      {cartCount > 0 && (
                        <span
                          className="bg-accent px-1 text-[0.625rem] text-accent-fg"
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
              className={`${styles.board} p-4 sm:p-6`}
            >
              {activeDay && (
                <p aria-hidden="true" className="font-meta text-xs uppercase tracking-[0.14em]">
                  {dayLabel(activeDay.date, locale)}
                  <span className="mt-2 block h-[2px] w-8 bg-accent" />
                </p>
              )}
              {!activeDay || activeDay.slots.length === 0 ? (
                <p className="py-8 text-center text-sm text-fg-muted">
                  {t("noSlotsThisDay")}
                </p>
              ) : (
                <ul
                  key={activeDay.id}
                  className={`${styles.rise} mt-5 grid gap-4 sm:grid-cols-2`}
                >
                  {activeDay.slots.map((slot) => {
                    const full = slot.remaining === 0;
                    const selected = selectedSlotIds.includes(slot.id);
                    return (
                      <li key={slot.id} className="flex">
                        <button
                          type="button"
                          disabled={full || pending || (cartAtLimit && !selected)}
                          aria-pressed={selected}
                          aria-describedby={
                            cartAtLimit && !selected
                              ? "booking-cart-limit"
                              : undefined
                          }
                          data-full={full ? "" : undefined}
                          onClick={() => toggleSlot(slot.id)}
                          className={`${styles.tile} flex min-h-[8.5rem] w-full flex-col items-stretch gap-1 py-4 pl-6 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed`}
                        >
                          <span className="font-meta min-h-4 text-[0.625rem] uppercase tracking-[0.12em] text-accent-text">
                            {slot.pricePerPerson
                              ? t("pricePerPersonDisplay", {
                                  price: slot.pricePerPerson
                                })
                              : ""}
                          </span>
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-meta text-2xl tracking-[0.02em]">
                              {slotTime(slot)}
                            </span>
                            {selected ? (
                              <span
                                aria-hidden="true"
                                className={`${styles.stamp} font-meta shrink-0 text-[0.625rem] font-bold uppercase tracking-[0.14em]`}
                              >
                                {t3("inTray")}
                              </span>
                            ) : (
                              !full && (
                                <span aria-hidden="true" className="shrink-0 text-xl leading-none text-fg-subtle">
                                  +
                                </span>
                              )
                            )}
                          </span>
                          {slot.description && (
                            <span className="text-xs text-fg-muted">
                              {slot.description}
                            </span>
                          )}
                          <span className="mt-auto flex items-center justify-between gap-3 pt-3">
                            <SeatPips left={slot.remaining} total={slot.capacity} />
                            <span
                              className={`font-meta ml-auto shrink-0 text-[0.625rem] uppercase tracking-[0.14em] ${
                                full ? "text-fg-subtle" : "text-success"
                              }`}
                            >
                              {full
                                ? t("full")
                                : t("slotsLeft", { count: slot.remaining })}
                            </span>
                          </span>
                          <span className="sr-only">{t("addToCart")}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </fieldset>

          <div className="sticky bottom-3 z-10 shadow-[0_14px_36px_-12px_rgb(0_0_0/0.35)]">
            <p className={`${styles.trayPlate} font-meta px-4 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em]`}>
              {t3("trayLabel", {
                count: pad(selectedSlotIds.length),
                max: CART_LIMIT
              })}
            </p>
            <div className="flex flex-col gap-3 border border-t-0 border-border-strong bg-raised/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {t("cartCount", { count: selectedSlotIds.length })}
                </p>
                {selectedSlots.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {selectedSlots.map((slot) => (
                      <li
                        key={slot.id}
                        className="font-meta whitespace-nowrap border-l-2 border-accent bg-page px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em]"
                      >
                        {dayLabel(slot.date, locale)} · {slotTime(slot)}
                      </li>
                    ))}
                  </ul>
                )}
                <p
                  id={cartAtLimit ? "booking-cart-limit" : undefined}
                  role={cartAtLimit ? "status" : undefined}
                  aria-live={cartAtLimit ? "polite" : undefined}
                  className={`mt-1 text-xs ${
                    cartAtLimit
                      ? "font-semibold text-warning"
                      : "text-fg-subtle max-sm:hidden"
                  }`}
                >
                  {cartAtLimit
                    ? t("cartLimitReached", { count: CART_LIMIT })
                    : t("cartHint")}
                </p>
              </div>
              <button
                type="button"
                disabled={selectedSlotIds.length === 0}
                onClick={() => {
                  setStep("review");
                  requestAnimationFrame(() =>
                    document.getElementById("booking-review")?.focus()
                  );
                }}
                className={`${primaryClass} w-full sm:w-auto`}
              >
                {t("reviewCart", { count: selectedSlotIds.length })}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <section
          id="booking-review"
          tabIndex={-1}
          className={`${styles.rise} flex flex-col gap-6 outline-none`}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold uppercase tracking-[-0.01em]">
                {t("reviewTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setStep("slots")}
                className="inline-flex min-h-10 items-center text-sm underline-offset-4 hover:underline"
              >
                + {t("addMoreSlots")}
              </button>
            </div>
            <p className="text-sm text-fg-muted">
              {t("subjectPerSlotHint", { term: subjectTerm })}
            </p>
            <ol className={`${styles.board} grid gap-4 p-4 sm:p-6`}>
              {selectedSlots.map((slot) => (
                <li
                  key={slot.id}
                  className={`${styles.tile} grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-4 pl-6 pr-4 ${
                    state.failedSlotId === slot.id ? "ring-2 ring-danger" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-meta text-lg">
                      {dayLabel(slot.date, locale)} · {slotTime(slot)}
                    </p>
                    {slot.description && (
                      <p className="text-xs text-fg-muted">{slot.description}</p>
                    )}
                    {slot.pricePerPerson && (
                      <p className="font-meta text-[0.625rem] uppercase tracking-[0.12em] text-accent-text">
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
                    className="min-h-10 shrink-0 text-xs text-danger underline underline-offset-4 disabled:opacity-50"
                  >
                    {t("remove")}
                  </button>
                  <label className="col-span-2 grid gap-1 text-sm">
                    <span className={metaLabel}>
                      {t("subjectForSlot", { term: subjectTerm })}
                    </span>
                    <input
                      name="subjects"
                      maxLength={200}
                      aria-label={t("subjectForSlotA11y", {
                        term: subjectTerm,
                        date: dayLabel(slot.date, locale),
                        time: slotTime(slot)
                      })}
                      value={subjectsBySlot[slot.id] ?? ""}
                      onChange={(event) =>
                        setSubjectsBySlot((current) => ({
                          ...current,
                          [slot.id]: event.target.value
                        }))
                      }
                      className={fieldClass}
                    />
                  </label>
                </li>
              ))}
            </ol>
          </div>

          <fieldset className="grid gap-4">
            <legend className={`${metaLabel} mb-3`}>{t("yourDetails")}</legend>
            {(
              [
                ["name", t("name"), "name", "text", true, null],
                ["contactValue", t("contactValue"), undefined, "text", true, t("contactHint")],
                ["email", t("email"), "email", "email", false, t("emailHint")]
              ] as const
            ).map(([name, label, autoComplete, type, required, hint]) => (
              <label key={name} className="grid gap-1 text-sm">
                <span className="text-fg-muted">
                  {label}
                  {required && " *"}
                </span>
                <input
                  name={name}
                  type={type}
                  required={required}
                  maxLength={200}
                  autoComplete={autoComplete}
                  value={details[name]}
                  onChange={(event) =>
                    setDetails((current) => ({
                      ...current,
                      [name]: event.target.value
                    }))
                  }
                  className={fieldClass}
                />
                {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
              </label>
            ))}
            <label className="grid gap-1 text-sm">
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
                className={fieldClass}
              />
            </label>
          </fieldset>

          {errorMessage && (
            <p
              role="alert"
              className="border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm text-danger"
            >
              {errorMessage}
            </p>
          )}

          <div className="flex flex-wrap-reverse items-center justify-between gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => setStep("slots")}
              className={secondaryClass}
            >
              <span aria-hidden="true">←</span> {t("backToSlots")}
            </button>
            <button
              type="submit"
              disabled={pending || selectedSlotIds.length === 0}
              className={primaryClass}
            >
              {pending
                ? t("bookingInProgress")
                : t("confirmBookings", { count: selectedSlotIds.length })}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      )}
    </form>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
