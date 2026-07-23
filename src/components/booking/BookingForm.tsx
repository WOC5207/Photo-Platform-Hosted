"use client";

import {
  useActionState,
  useId,
  useState,
  type KeyboardEvent
} from "react";
import { useLocale, useTranslations } from "next-intl";
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

export interface PublicContactMethod {
  id: string;
  label: string; // already resolved to the current locale
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

export default function BookingForm({
  days,
  contactMethods,
  subjectTerm
}: {
  days: PublicDay[];
  contactMethods: PublicContactMethod[];
  subjectTerm: string;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    BookingFormState,
    FormData
  >(createBooking, {});
  const tabsId = useId().replace(/:/g, "");

  // Default to the first day that actually has availability, so a visitor
  // doesn't land on an empty tab when earlier days are sold out/unset.
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

  const errorMessage = state.error
    ? {
        validation: t("errorValidation"),
        slotFull: t("errorSlotFull"),
        slotUnavailable: t("errorSlotUnavailable"),
        rateLimited: t("errorRateLimited"),
        closed: t("errorClosed")
      }[state.error]
    : null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold">
          {t("chooseSlot")}
        </legend>

        {days.length > 1 && (
          <div role="tablist" aria-label={t("chooseDay")} className="flex flex-wrap gap-2">
            {days.map((day, index) => {
              const selected = day.id === activeDay?.id;
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
                    "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11",
                    selected
                      ? "border-fg bg-fg text-page"
                      : "border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
                  ].join(" ")}
                >
                  {dayLabel(day.date, locale)}
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
            return (
              <label
                key={slot.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 transition ${
                  full
                    ? "cursor-not-allowed border-border bg-surface/50 text-fg-faint"
                    : "border-border-strong bg-surface hover:border-fg-subtle has-[:checked]:border-fg has-[:checked]:bg-surface-2"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="slotId"
                    value={slot.id}
                    disabled={full}
                    required
                    className="h-4 w-4 accent-fg"
                  />
                  <span className="flex flex-col">
                    <span className="font-mono text-sm">
                      {slot.start.slice(11, 16)}–{slot.end.slice(11, 16)}
                    </span>
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
                  </span>
                </span>
                <span className={`text-xs ${full ? "" : "text-success"}`}>
                  {full ? t("full") : t("slotsLeft", { count: slot.remaining })}
                </span>
              </label>
            );
          })
        )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">
          {t("yourDetails")}
        </legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("name")} *</span>
          <input name="name" required maxLength={200} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("subject", { term: subjectTerm })}</span>
          <input name="subject" maxLength={200} className={inputCls} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("contactMethod")} *</span>
            <select
              name="contactMethod"
              required
              defaultValue=""
              className={inputCls}
            >
              <option value="" disabled>
                {t("contactMethodPlaceholder")}
              </option>
              {contactMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("contactValue")} *</span>
            <input
              name="contactValue"
              required
              maxLength={200}
              className={inputCls}
            />
          </label>
        </div>
        <p className="-mt-2 text-xs text-fg-subtle">{t("contactHint")}</p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("email")}</span>
          <input
            name="email"
            type="email"
            maxLength={200}
            autoComplete="email"
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
            className={inputCls}
          />
        </label>
      </fieldset>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !hasAvailableSlot || contactMethods.length === 0}
        className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        {t("submit")}
      </button>
    </form>
  );
}
