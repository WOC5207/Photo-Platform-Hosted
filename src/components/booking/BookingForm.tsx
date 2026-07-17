"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  createBooking,
  type BookingFormState
} from "@/app/[locale]/(public)/book/actions";

export interface PublicSlot {
  id: string;
  start: string; // ISO, naive-as-UTC
  end: string;
  remaining: number;
  description: string;
}

export interface PublicContactMethod {
  id: string;
  label: string; // already resolved to the current locale
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

function fmt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export default function BookingForm({
  slots,
  contactMethods,
  subjectTerm
}: {
  slots: PublicSlot[];
  contactMethods: PublicContactMethod[];
  subjectTerm: string;
}) {
  const t = useTranslations("booking");
  const [state, formAction, pending] = useActionState<
    BookingFormState,
    FormData
  >(createBooking, {});

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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">
          {t("chooseSlot")}
        </legend>
        {slots.map((slot) => {
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
                    {fmt(slot.start)}–{slot.end.slice(11, 16)}
                  </span>
                  {slot.description && (
                    <span className="text-xs text-fg-subtle">
                      {slot.description}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`text-xs ${full ? "" : "text-success"}`}
              >
                {full ? t("full") : t("slotsLeft", { count: slot.remaining })}
              </span>
            </label>
          );
        })}
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
                <option key={m.id} value={m.label}>
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
        disabled={pending}
        className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        {t("submit")}
      </button>
    </form>
  );
}
