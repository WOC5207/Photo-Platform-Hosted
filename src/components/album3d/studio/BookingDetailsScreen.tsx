"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updateBookingEvent, type BookingEventFormState } from "@/app/[locale]/dashboard/(protected)/bookings/actions";
import { deleteBookingEvent3d } from "@/app/[locale]/3d/u/[username]/studio/actions";
import LotteryEnabledToggle from "@/components/admin/LotteryEnabledToggle";
import { BookingPanel, fieldClass, metaLabel, primaryClass, secondaryClass } from "../booking/shared";
import { FormNote, StudioHeading, daysBetween } from "./shared";
import type { StudioBookingSettings } from "./types";

/**
 * A booking page's settings: whether it takes bookings, its titles, days,
 * place and descriptions, whether visitors may change their bookings, the
 * prize draw's switch, and deleting the page. The form is the classic one's
 * fields in one panel, saved by the same action.
 */
export default function BookingDetailsScreen({ booking }: { booking: StudioBookingSettings }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("adminBookings");
  const ta = useTranslations("adminEvents");
  const tw = useTranslations("eventWorkspace");
  const ts = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<BookingEventFormState, FormData>(updateBookingEvent, {});
  const firstDay = booking.dates[0] ?? "";
  const lastDay = booking.dates[booking.dates.length - 1] ?? "";
  const [first, setFirst] = useState(firstDay);
  const [last, setLast] = useState(lastDay);
  const [visitorEdits, setVisitorEdits] = useState(booking.visitorEditsEnabled);
  const [confirming, setConfirming] = useState(false);
  // The saved days stand until the range is changed, so days picked apart on
  // the classic calendar survive a save here.
  const changed = first !== firstDay || last !== lastDay;
  const days = changed ? daysBetween(first, last) : booking.dates;
  const label = "grid gap-1 text-sm font-semibold text-fg-muted";

  const error =
    state.error === "validation"
      ? tb("validationError")
      : state.error === "noSlots"
        ? tb("noSlots")
        : state.error === "dayHasBookings"
          ? tb("dayHasBookings")
          : state.error
            ? t("studioError")
            : null;

  return (
    <BookingPanel expanded>
      <StudioHeading trail={booking.title} title={t("studioBookingDetails")} />
      {!booking.bookingEnabled && <p role="status" className="mt-5 text-sm text-fg-muted">{ts("groupBookingHint")}</p>}

      <form action={action} aria-busy={pending} className="mt-6 grid gap-4">
        <input type="hidden" name="id" value={booking.id} />
        <input type="hidden" name="dates" value={JSON.stringify(days)} />
        <label className="flex min-h-11 items-center gap-3 border border-border-strong px-3 text-sm font-semibold">
          <input type="checkbox" name="open" defaultChecked={booking.open} className="h-4 w-4 accent-[var(--color-accent)]" />
          {tb("openLabel")}
        </label>
        <label className={label}>
          {ta("titleEn")}
          <input name="titleEn" defaultValue={booking.titleEn} maxLength={300} className={fieldClass} />
        </label>
        <label className={label}>
          {ta("titleZh")}
          <input name="titleZh" defaultValue={booking.titleZh} maxLength={300} className={fieldClass} />
        </label>
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
        <p className="-mt-2 text-xs text-fg-subtle">{days.length > 0 ? t("studioDays", { count: days.length }) : ta("dateRangeHint")}</p>
        <label className={label}>
          {ta("location")}
          <input name="location" defaultValue={booking.location} maxLength={300} className={fieldClass} />
        </label>
        <label className={label}>
          {ta("descriptionEn")}
          <textarea name="descriptionEn" defaultValue={booking.descriptionEn} rows={3} maxLength={5000} className={fieldClass} />
        </label>
        <label className={label}>
          {ta("descriptionZh")}
          <textarea name="descriptionZh" defaultValue={booking.descriptionZh} rows={3} maxLength={5000} className={fieldClass} />
        </label>

        <fieldset className="grid gap-3 border border-border-strong p-3">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="visitorEditsEnabled"
              checked={visitorEdits}
              onChange={(e) => setVisitorEdits(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block font-semibold">{tb("visitorEditsLabel")}</span>
              <span className="mt-1 block text-xs text-fg-subtle">{tb("visitorEditsHint")}</span>
            </span>
          </label>
          <label className={label}>
            {tb("visitorEditCutoffLabel")}
            <span className="flex items-center gap-2">
              <input
                name="visitorEditCutoffHours"
                type="number"
                min={0}
                max={8760}
                required
                readOnly={!visitorEdits}
                defaultValue={booking.visitorEditCutoffHours}
                className={`${fieldClass} w-28 ${visitorEdits ? "" : "border-dashed text-fg-subtle"}`}
              />
              <span className="font-normal text-fg-subtle">{tb("hours")}</span>
            </span>
          </label>
        </fieldset>

        {error && <FormNote tone="error">{error}</FormNote>}
        {state.ok && !pending && <FormNote tone="ok">{t("studioSaved")}</FormNote>}
        <button type="submit" disabled={pending || days.length === 0} className={primaryClass}>
          {pending ? t("studioSaving") : tc("save")}
          <span aria-hidden="true" className="text-lg">→</span>
        </button>
      </form>

      {booking.showLottery && (
        <section className="mt-8 border-t border-border pt-5">
          <h2 className={metaLabel}>{tb("lotteryTool")}</h2>
          <div className="mt-2">
            <LotteryEnabledToggle bookingEventId={booking.id} defaultEnabled={booking.lotteryEnabled} label={tb("lotteryEnabledLabel")} />
          </div>
        </section>
      )}

      <div className="mt-8 border-t border-border pt-5">
        {confirming ? (
          <form action={deleteBookingEvent3d} className="grid gap-3">
            <input type="hidden" name="id" value={booking.id} />
            <p role="alert" className="text-sm font-semibold text-danger">{tb("confirmDeleteEvent")}</p>
            {booking.hasGallery && <p className="text-sm text-fg-muted">{tw("bookingDeleteHint")}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={`${secondaryClass} border-danger text-danger`}>{tb("deleteEvent")}</button>
              <button type="button" onClick={() => setConfirming(false)} className={secondaryClass}>{tc("cancel")}</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={`${secondaryClass} text-danger`}>
            {tb("deleteEvent")}
          </button>
        )}
      </div>
    </BookingPanel>
  );
}
