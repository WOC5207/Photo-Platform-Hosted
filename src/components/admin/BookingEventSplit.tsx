"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  splitBookingEvent,
  type SplitEventState
} from "@/app/[locale]/dashboard/(protected)/bookings/actions";

export interface SplitDay {
  id: string;
  label: string;
}

/**
 * Break a subset of a multi-day event's days out into a new event with its own
 * link. At least one day must be split off and at least one must stay, so the
 * submit is disabled until the selection is a proper subset.
 */
export default function BookingEventSplit({
  eventId,
  days
}: {
  eventId: string;
  days: SplitDay[];
}) {
  const t = useTranslations("adminBookings");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<
    SplitEventState,
    FormData
  >(splitBookingEvent, {});

  const canSplit = selected.size >= 1 && selected.size < days.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">{t("splitTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("splitHint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {days.map((day) => {
          const checked = selected.has(day.id);
          return (
            <label
              key={day.id}
              className={[
                "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition max-sm:min-h-11",
                checked
                  ? "border-fg bg-fg text-page"
                  : "border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(day.id)}
                className="sr-only"
              />
              {day.label}
            </label>
          );
        })}
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {state.error === "lotterySplit"
            ? t("splitLottery")
            : t("splitInvalid")}
        </p>
      )}

      <form action={formAction} className="flex items-center">
        <input type="hidden" name="eventId" value={eventId} />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="dayId" value={id} />
        ))}
        <button
          type="submit"
          disabled={!canSplit || pending}
          onClick={(e) => {
            if (!confirm(t("splitConfirm", { count: selected.size }))) {
              e.preventDefault();
            }
          }}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11"
        >
          {pending ? t("splitting") : t("splitOff", { count: selected.size })}
        </button>
      </form>
    </section>
  );
}
