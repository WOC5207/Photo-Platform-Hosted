"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import StatusMessage from "@/components/ui/StatusMessage";
import {
  updateMyBooking,
  type EditBookingState
} from "@/app/[locale]/(public)/my-booking/[cancelToken]/actions";

export interface EditableBookingSlot {
  id: string;
  label: string;
}

const inputCls =
  "min-h-11 rounded-lg border border-border-strong bg-control px-3.5 py-2.5 text-fg outline-none transition-[border-color,background-color,box-shadow] placeholder:text-fg-faint hover:border-fg-faint focus:border-accent/60 focus:bg-raised focus-visible:ring-2 focus-visible:ring-accent/20";

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
    <details className="group rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-fg marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40">
        <span>{t("editBooking")}</span>
        <span
          aria-hidden="true"
          className="text-accent transition-transform duration-150 group-open:rotate-45"
        >
          +
        </span>
      </summary>

      <form action={action} className="flex flex-col gap-5 border-t border-border p-4 sm:p-5">
        <input type="hidden" name="cancelToken" value={cancelToken} />

        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-lg font-semibold text-fg">
            {t("editSchedule")}
          </legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("timeLabel")}</span>
            <select
              name="targetSlotId"
              defaultValue={currentSlotId}
              className={inputCls}
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
          <legend className="col-span-full font-display text-lg font-semibold text-fg">
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
              defaultValue={initial.subject}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("contactValue")} *</span>
            <input
              name="contactValue"
              required
              maxLength={200}
              defaultValue={initial.contactValue}
              className={inputCls}
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
              className={inputCls}
            />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("notes")}</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={initial.notes}
              className={inputCls}
            />
          </label>
        </fieldset>

        {error && <StatusMessage kind="error">{error}</StatusMessage>}
        {state.ok && (
          <StatusMessage kind="success">{t("editSaved")}</StatusMessage>
        )}

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? t("editSaving") : t("saveBookingChanges")}
          </Button>
        </div>
      </form>
    </details>
  );
}
