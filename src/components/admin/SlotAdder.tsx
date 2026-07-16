"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addSlots,
  type SlotFormState
} from "@/app/[locale]/admin/(protected)/bookings/actions";

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

export default function SlotAdder({ eventId }: { eventId: string }) {
  const t = useTranslations("adminBookings");
  const [state, formAction, pending] = useActionState<SlotFormState, FormData>(
    addSlots,
    {}
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <h3 className="font-semibold">{t("addSlots")}</h3>
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("firstSlotStart")}</span>
          <input
            name="firstSlotStart"
            type="datetime-local"
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
      </div>
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
      {state.error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {t("slotsValidationError")}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        + {t("addSlotsButton")}
      </button>
    </form>
  );
}
