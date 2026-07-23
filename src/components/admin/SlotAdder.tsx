"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  addSlots,
  type SlotFormState
} from "@/app/[locale]/dashboard/(protected)/bookings/actions";
import Button from "@/components/ui/Button";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

const inputCls =
  "min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11";

export default function SlotAdder({
  bookingDayId,
  timeZone,
  allowMultiDaySync,
  priceEnabled
}: {
  bookingDayId: string;
  timeZone: string;
  allowMultiDaySync: boolean;
  priceEnabled: boolean;
}) {
  const t = useTranslations("adminBookings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<SlotFormState, FormData>(
    addSlots,
    {}
  );
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <h3 className="font-semibold">{t("addSlots")}</h3>
      <p className="-mt-3 text-xs text-fg-subtle">
        {t("timeZoneNotice", { timeZone })}
      </p>
      <input type="hidden" name="bookingDayId" value={bookingDayId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("firstSlotTime")}</span>
          <input
            name="startTime"
            type="time"
            required
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotMinutes")}</span>
          <input
            name="slotMinutes"
            type="number"
            min={5}
            max={1440}
            defaultValue={20}
            required
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotCount")}</span>
          <input
            name="slotCount"
            type="number"
            min={1}
            max={100}
            defaultValue={1}
            required
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("capacity")}</span>
          <input
            name="capacity"
            type="number"
            min={1}
            max={1000}
            defaultValue={1}
            required
            className={inputCls}
          />
        </label>
        {priceEnabled && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("pricePerPerson")}</span>
            <input
              name="pricePerPerson"
              maxLength={60}
              placeholder={t("pricePerPersonPlaceholder")}
              autoComplete="off"
              className={inputCls}
            />
          </label>
        )}
      </div>
      {priceEnabled && (
        <p className="-mt-2 text-xs text-fg-subtle">
          {t("pricePerPersonHint")}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotDescriptionEn")}</span>
          <input
            name="descriptionEn"
            maxLength={120}
            placeholder={t("slotDescriptionPlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotDescriptionZh")}</span>
          <input
            name="descriptionZh"
            maxLength={120}
            placeholder={t("slotDescriptionPlaceholder")}
            className={inputCls}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">{t("slotDescriptionHint")}</p>
      {allowMultiDaySync && (
        <label className="flex items-start gap-3 rounded-lg border border-border bg-page/60 p-3 text-sm">
          <input
            type="checkbox"
            name="syncAcrossDays"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
          />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{t("syncAcrossDays")}</span>
            <span className="text-xs text-fg-subtle">
              {t("syncAcrossDaysHint")}
            </span>
          </span>
        </label>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {t("slotsValidationError")}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        + {t("addSlotsButton")}
      </Button>
    </form>
  );
}
