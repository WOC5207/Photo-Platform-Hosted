"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  editSlot,
  type SlotEditState
} from "@/app/[locale]/dashboard/(protected)/bookings/actions";
import Button from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

export interface EditableSlot {
  id: string;
  dayId: string;
  /** "HH:MM", the event's local time. */
  start: string;
  end: string;
  capacity: number;
  /** Confirmed bookings: the floor for capacity. */
  booked: number;
  price: string;
  descriptionEn: string;
  descriptionZh: string;
}

const checkboxClass =
  "mt-0.5 h-5 w-5 shrink-0 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40";

export interface SlotEditorProps {
  slot: EditableSlot;
  days: { id: string; label: string }[];
  priceEnabled: boolean;
  /** On submit: once saved, the slot may sit on another day or in another order. */
  onSaving?: (slotId: string) => void;
}

/**
 * The slot editor's form, loaded when the photographer opens it (see
 * SlotEditor). When visitors hold the slot their bookings move with it, and
 * the form offers to email them the new time.
 */
export default function SlotEditForm({
  slot,
  days,
  priceEnabled,
  onSaving,
  onClose
}: SlotEditorProps & { onClose: () => void }) {
  const t = useTranslations("adminBookings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<SlotEditState, FormData>(
    editSlot,
    {}
  );
  const [dirty, setDirty] = useState(false);
  const [dayId, setDayId] = useState(slot.dayId);
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);

  const timeChanged =
    dayId !== slot.dayId || start !== slot.start || end !== slot.end;
  const fieldId = (name: string) => `slot-${slot.id}-${name}`;

  return (
    <form
      id={fieldId("form")}
      action={formAction}
      onSubmit={() => onSaving?.(slot.id)}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <h3 className="font-semibold">{t("editSlot")}</h3>
      <input type="hidden" name="slotId" value={slot.id} />
      {days.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotDay")}</span>
          <select
            name="bookingDayId"
            value={dayId}
            onChange={(event) => setDayId(event.target.value)}
            className={controlClasses}
          >
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="bookingDayId" value={dayId} />
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotStart")}</span>
          <input
            name="startTime"
            type="time"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className={controlClasses}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotEnd")}</span>
          <input
            name="endTime"
            type="time"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className={controlClasses}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("capacity")}</span>
          <input
            name="capacity"
            type="number"
            min={Math.max(1, slot.booked)}
            max={1000}
            defaultValue={slot.capacity}
            required
            aria-describedby={slot.booked > 0 ? fieldId("capacity-hint") : undefined}
            className={controlClasses}
          />
          {slot.booked > 0 && (
            <span id={fieldId("capacity-hint")} className="text-xs text-fg-subtle">
              {t("slotCapacityFloor", { booked: slot.booked })}
            </span>
          )}
        </label>
        {priceEnabled && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("pricePerPerson")}</span>
            <input
              name="pricePerPerson"
              maxLength={60}
              defaultValue={slot.price}
              placeholder={t("pricePerPersonPlaceholder")}
              autoComplete="off"
              className={controlClasses}
            />
          </label>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotDescriptionEn")}</span>
          <input
            name="descriptionEn"
            maxLength={120}
            defaultValue={slot.descriptionEn}
            placeholder={t("slotDescriptionPlaceholder")}
            className={controlClasses}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("slotDescriptionZh")}</span>
          <input
            name="descriptionZh"
            maxLength={120}
            defaultValue={slot.descriptionZh}
            placeholder={t("slotDescriptionPlaceholder")}
            className={controlClasses}
          />
        </label>
      </div>

      {slot.booked > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-page/60 p-3 text-sm">
          <p>{t("slotHasBookings", { count: slot.booked })}</p>
          {timeChanged && (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="notifyVisitors"
                defaultChecked
                className={checkboxClass}
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{t("notifyVisitorsTime")}</span>
                <span className="text-xs text-fg-subtle">{t("notifyVisitorsHint")}</span>
              </span>
            </label>
          )}
        </div>
      )}

      {state.error === "overlap" && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          <p>{t("slotEditOverlap")}</p>
          <ul className="list-disc pl-5 font-meta">
            {state.overlaps?.map((label) => <li key={label}>{label}</li>)}
          </ul>
          <label className="flex items-start gap-3 text-fg">
            <input type="checkbox" name="allowOverlap" className={checkboxClass} />
            <span>{t("slotEditAllowOverlap")}</span>
          </label>
        </div>
      )}
      {state.error && state.error !== "overlap" && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.error === "invalidTime"
            ? t("slotEditInvalidTime")
            : state.error === "belowBooked"
              ? t("slotEditBelowBooked", { booked: state.booked ?? slot.booked })
              : t("slotsValidationError")}
        </p>
      )}
      {state.ok && !dirty && <SavedNote state={state} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {t("saveSlot")}
        </Button>
        <Button
          type="button"
          onClick={() => {
            setDirty(false);
            onClose();
          }}
        >
          {state.ok && !dirty ? tc("close") : tc("cancel")}
        </Button>
      </div>
    </form>
  );
}

function SavedNote({ state }: { state: SlotEditState }) {
  const t = useTranslations("adminBookings");
  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
      <p>
        {state.emailed
          ? t("slotSavedEmailed", { count: state.emailed })
          : t("slotSaved")}
      </p>
      {!!state.unreachable && <p>{t("slotSavedUnreachable", { count: state.unreachable })}</p>}
    </div>
  );
}
