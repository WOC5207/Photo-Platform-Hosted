"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import type { EventFormState } from "@/app/[locale]/dashboard/(protected)/events/actions";

export interface EventFormValues {
  id?: string;
  titleEn: string;
  titleZh: string;
  slug: string;
  dateStart: string; // yyyy-mm-dd or ""
  dateEnd: string; // yyyy-mm-dd or ""
  location: string;
  descriptionEn: string;
  descriptionZh: string;
  published: boolean;
}

const inputCls =
  "min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

export default function EventForm({
  action,
  initial,
  submitLabel,
  cancelHref
}: {
  action: (prev: EventFormState, formData: FormData) => Promise<EventFormState>;
  initial: EventFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(
    action,
    {}
  );

  const [dateStart, setDateStart] = useState(initial.dateStart);
  const [dateEnd, setDateEnd] = useState(initial.dateEnd);
  // Once the end date diverges from the start date, treat it as an
  // intentional multi-day range and stop auto-following further start-date
  // edits — only a brand-new or still-single-day event keeps syncing.
  const [endFollowsStart, setEndFollowsStart] = useState(
    initial.dateEnd === "" || initial.dateEnd === initial.dateStart
  );

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
          <span className="text-fg-muted">{t("dateStart")}</span>
          <input
            name="dateStart"
            type="date"
            value={dateStart}
            onChange={(e) => {
              const value = e.target.value;
              setDateStart(value);
              if (endFollowsStart) setDateEnd(value);
            }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("dateEnd")}</span>
          <input
            name="dateEnd"
            type="date"
            value={dateEnd}
            onChange={(e) => {
              const value = e.target.value;
              setDateEnd(value);
              // Clearing the end date opts back into auto-following the
              // start date, same as a brand-new event.
              setEndFollowsStart(value === "" || value === dateStart);
            }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("location")}</span>
          <input
            name="location"
            defaultValue={initial.location}
            maxLength={300}
            className={inputCls}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">{t("dateRangeHint")}</p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("slug")}</span>
        <input
          name="slug"
          defaultValue={initial.slug}
          maxLength={100}
          pattern="[a-z0-9-]*"
          className={inputCls}
        />
        <span className="text-xs text-fg-subtle">{t("slugHint")}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("descriptionEn")}</span>
          <textarea
            name="descriptionEn"
            defaultValue={initial.descriptionEn}
            rows={4}
            maxLength={5000}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("descriptionZh")}</span>
          <textarea
            name="descriptionZh"
            defaultValue={initial.descriptionZh}
            rows={4}
            maxLength={5000}
            className={inputCls}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={initial.published}
          className="h-5 w-5 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
        />
        <span>{t("publishedLabel")}</span>
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.error === "validation" ? t("validationError") : tc("error")}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
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
