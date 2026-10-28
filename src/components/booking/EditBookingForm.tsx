"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  fieldClass,
  metaLabel,
  primaryClass
} from "./classes";
import {
  updateMyBooking,
  type EditBookingState
} from "@/app/[locale]/(public)/my-booking/[cancelToken]/actions";

export interface EditableBookingSlot {
  id: string;
  label: string;
}

export default function EditBookingForm({
  cancelToken,
  subjectTerm,
  currentSlotId,
  slots,
  initial
}: {
  cancelToken: string;
  subjectTerm: string;
  currentSlotId: string;
  slots: EditableBookingSlot[];
  initial: {
    name: string;
    subject: string;
    contactValue: string;
    email: string;
    notes: string;
  };
}) {
  const t = useTranslations("booking");
  const [state, action, pending] = useActionState<EditBookingState, FormData>(
    updateMyBooking,
    {}
  );
  const error = state.error
    ? {
        validation: t("editErrorValidation"),
        rateLimited: t("editErrorRateLimited"),
        notFound: t("editErrorUnavailable"),
        disabled: t("editErrorDisabled"),
        cutoff: t("editErrorCutoff"),
        closed: t("editErrorClosed"),
        slotUnavailable: t("editErrorSlotUnavailable"),
        slotFull: t("editErrorSlotFull")
      }[state.error]
    : null;

  return (
    <details className="group border border-border-strong">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold uppercase tracking-[0.06em] text-fg marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40">
        <span>{t("editBooking")}</span>
        <span
          aria-hidden="true"
          className="text-lg text-accent transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
        >
          +
        </span>
      </summary>

      <form action={action} className="flex flex-col gap-5 border-t border-border-strong p-4 sm:p-5">
        <input type="hidden" name="cancelToken" value={cancelToken} />

        <fieldset className="flex flex-col gap-3">
          <legend className={`${metaLabel} mb-1`}>
            {t("editSchedule")}
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("timeLabel")}</span>
            <select
              name="targetSlotId"
              defaultValue={currentSlotId}
              className={fieldClass}
            >
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
            </select>
          </label>
          {slots.length === 1 && (
            <p className="text-xs text-fg-subtle">{t("noAlternateTimes")}</p>
          )}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className={`${metaLabel} col-span-full mb-1`}>
            {t("editDetails")}
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("name")} *</span>
            <input
              name="name"
              required
              maxLength={200}
              autoComplete="name"
              defaultValue={initial.name}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">
              {t("subject", { term: subjectTerm })}
            </span>
            <input
              name="subject"
              maxLength={200}
              defaultValue={initial.subject}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("contactValue")} *</span>
            <input
              name="contactValue"
              required
              maxLength={200}
              defaultValue={initial.contactValue}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("email")}</span>
            <input
              name="email"
              type="email"
              maxLength={200}
              autoComplete="email"
              defaultValue={initial.email}
              className={fieldClass}
            />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("notes")}</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={initial.notes}
              className={fieldClass}
            />
          </label>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {state.ok && (
          <p
            role="status"
            className="border-l-2 border-success bg-success-surface px-3 py-2 text-sm text-success-strong"
          >
            {t("editSaved")}
          </p>
        )}

        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" disabled={pending} className={primaryClass}>
            {pending ? t("editSaving") : t("saveBookingChanges")}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </details>
  );
}
