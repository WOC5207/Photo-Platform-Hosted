"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createEvent3d, type StudioEventState } from "@/app/[locale]/3d/u/[username]/studio/actions";
import { BookingPanel, fieldClass, primaryClass } from "../booking/shared";
import { ClassicLink, FormNote, StudioHeading } from "./shared";

/** The days from the first to the last, as the event form's calendar sends them. */
function daysBetween(first: string, last: string): string[] {
  if (!first) return [];
  const start = Date.parse(`${first}T00:00:00Z`);
  const end = last ? Date.parse(`${last}T00:00:00Z`) : start;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const days: string[] = [];
  for (let t = start; t <= end && days.length < 60; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

/**
 * A new event, as the classic "New event" form makes one: its gallery
 * (a draft until published) and its booking page and packing lists, closed
 * until the photographer opens them.
 */
export default function NewEventScreen() {
  const t = useTranslations("album3d");
  const ta = useTranslations("adminEvents");
  const tw = useTranslations("eventWorkspace");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<StudioEventState, FormData>(createEvent3d, {});
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const days = daysBetween(first, last);
  const label = "grid gap-1 text-sm font-semibold text-fg-muted";

  return (
    <BookingPanel expanded>
      <StudioHeading trail={t("studioEvents")} title={tw("newEvent")} />
      <form action={action} aria-busy={pending} className="mt-6 grid gap-4">
        <p className="text-sm text-fg-muted">{t("studioNewHint")}</p>
        <input type="hidden" name="dates" value={JSON.stringify(days)} />
        <input type="hidden" name="visitorEditCutoffHours" value="24" />
        <label className={label}>
          {ta("titleEn")}
          <input name="titleEn" maxLength={300} className={fieldClass} />
        </label>
        <label className={label}>
          {ta("titleZh")}
          <input name="titleZh" maxLength={300} className={fieldClass} />
        </label>
        <p className="-mt-2 text-xs text-fg-subtle">{ta("titleHint")}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {ta("dateStart")}
            <input type="date" required value={first} onChange={(e) => setFirst(e.target.value)} className={fieldClass} />
          </label>
          <label className={label}>
            {ta("dateEnd")}
            <input type="date" min={first} value={last} onChange={(e) => setLast(e.target.value)} className={fieldClass} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-fg-subtle">
          {days.length > 0 ? t("studioDays", { count: days.length }) : ta("dateRangeHint")}
        </p>
        <label className={label}>
          {ta("location")}
          <input name="location" maxLength={300} className={fieldClass} />
        </label>
        <label className={label}>
          {ta("descriptionEn")}
          <textarea name="descriptionEn" rows={3} maxLength={5000} className={fieldClass} />
        </label>
        <label className={label}>
          {ta("descriptionZh")}
          <textarea name="descriptionZh" rows={3} maxLength={5000} className={fieldClass} />
        </label>
        {state.error && <FormNote tone="error">{state.error === "validation" ? ta("validationError") : t("studioError")}</FormNote>}
        <button type="submit" disabled={pending || days.length === 0} className={primaryClass}>
          {pending ? t("studioSaving") : tc("create")}
          <span aria-hidden="true" className="text-lg">→</span>
        </button>
      </form>
      <ClassicLink href="/dashboard/events/new" />
    </BookingPanel>
  );
}
