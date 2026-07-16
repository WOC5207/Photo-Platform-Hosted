"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { BookingEventFormState } from "@/app/[locale]/admin/(protected)/bookings/actions";

export interface BookingEventFormValues {
  id?: string;
  titleEn: string;
  titleZh: string;
  date: string; // yyyy-mm-dd
  location: string;
  descriptionEn: string;
  descriptionZh: string;
  open: boolean;
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

export default function BookingEventForm({
  action,
  initial,
  submitLabel
}: {
  action: (
    prev: BookingEventFormState,
    formData: FormData
  ) => Promise<BookingEventFormState>;
  initial: BookingEventFormValues;
  submitLabel: string;
}) {
  const t = useTranslations("adminBookings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    BookingEventFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("titleEn")}</span>
          <input
            name="titleEn"
            defaultValue={initial.titleEn}
            maxLength={300}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("titleZh")}</span>
          <input
            name="titleZh"
            defaultValue={initial.titleZh}
            maxLength={300}
            className={inputCls}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">{t("titleHint")}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("date")}</span>
          <input
            name="date"
            type="date"
            required
            defaultValue={initial.date}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-fg-muted">{t("location")}</span>
          <input
            name="location"
            defaultValue={initial.location}
            maxLength={300}
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("descriptionEn")}</span>
          <textarea
            name="descriptionEn"
            defaultValue={initial.descriptionEn}
            rows={3}
            maxLength={5000}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("descriptionZh")}</span>
          <textarea
            name="descriptionZh"
            defaultValue={initial.descriptionZh}
            rows={3}
            maxLength={5000}
            className={inputCls}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="open"
          defaultChecked={initial.open}
          className="h-4 w-4 accent-fg"
        />
        <span>{t("openLabel")}</span>
      </label>

      {state.error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.error === "validation" ? t("validationError") : tc("error")}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
          {tc("saved")}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
