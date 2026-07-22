"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import BookingDayPicker from "@/components/admin/BookingDayPicker";
import type { BookingEventFormState } from "@/app/[locale]/dashboard/(protected)/bookings/actions";

export interface BookingEventFormValues {
  id?: string;
  titleEn: string;
  titleZh: string;
  dates: string[]; // yyyy-mm-dd, the days the event spans
  location: string;
  descriptionEn: string;
  descriptionZh: string;
  open: boolean;
}

const inputCls =
  "min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

export default function BookingEventForm({
  action,
  initial,
  submitLabel,
  showOpenToggle = true,
  cancelHref
}: {
  action: (
    prev: BookingEventFormState,
    formData: FormData
  ) => Promise<BookingEventFormState>;
  initial: BookingEventFormValues;
  submitLabel: string;
  showOpenToggle?: boolean;
  cancelHref: string;
}) {
  const t = useTranslations("adminBookings");
  const ts = useTranslations("adminSite");
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

      <BookingDayPicker initialDates={initial.dates} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("location")}</span>
        <input
          name="location"
          defaultValue={initial.location}
          maxLength={300}
          className={inputCls}
        />
      </label>

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

      {showOpenToggle && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="open"
            defaultChecked={initial.open}
            className="h-5 w-5 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
          />
          <span>{t("openLabel")}</span>
        </label>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger"
        >
          {state.error === "validation"
            ? t("validationError")
            : state.error === "noSlots"
              ? t("noSlots")
              : state.error === "noContactMethods"
                ? ts("noContactMethods")
                : state.error === "dayHasBookings"
                  ? t("dayHasBookings")
                  : tc("error")}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success"
        >
          {tc("saved")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonClasses({ variant: "ghost" })}>
          {tc("cancel")}
        </Link>
      </div>
    </form>
  );
}
