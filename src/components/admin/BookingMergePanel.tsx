"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import {
  mergeBookingEvents,
  type MergeEventsState
} from "@/app/[locale]/dashboard/(protected)/bookings/actions";

export interface MergeEventItem {
  id: string;
  title: string;
  meta: string;
  statusLabel: string;
  statusOpen: boolean;
  hasLottery: boolean;
}

/**
 * The booking-events list with multi-select. Checking two or more events
 * reveals a panel to pick which one keeps its public link (the primary) and
 * fold the rest into it. Each row still links to its own edit page.
 */
export default function BookingMergePanel({
  events,
  lotteryLabel
}: {
  events: MergeEventItem[];
  lotteryLabel: string;
}) {
  const t = useTranslations("adminBookings");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [state, formAction, pending] = useActionState<
    MergeEventsState,
    FormData
  >(mergeBookingEvents, {});

  const selectedEvents = useMemo(
    () => events.filter((event) => selected.has(event.id)),
    [events, selected]
  );
  // Keep the chosen primary within the current selection.
  const effectiveTarget =
    selectedEvents.find((event) => event.id === target)?.id ??
    selectedEvents[0]?.id ??
    "";
  const targetTitle =
    selectedEvents.find((event) => event.id === effectiveTarget)?.title ?? "";

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-subtle">{t("mergeHint")}</p>

      <ul className="flex flex-col gap-3">
        {events.map((event) => {
          const checked = selected.has(event.id);
          return (
            <li
              key={event.id}
              className="flex items-stretch gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={t("mergeSelectLabel", { title: event.title })}
                  onChange={() => toggle(event.id)}
                  className="h-5 w-5 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                />
              </label>
              <Link
                href={`/dashboard/bookings/${event.id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{event.title}</h2>
                  <p className="text-sm text-fg-subtle">{event.meta}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {event.hasLottery && (
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-subtle">
                      {lotteryLabel}
                    </span>
                  )}
                  <span
                    className={
                      event.statusOpen
                        ? "rounded-md bg-success-surface px-2 py-0.5 text-xs text-success"
                        : "rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-subtle"
                    }
                  >
                    {event.statusLabel}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {selectedEvents.length >= 2 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4">
          <h3 className="font-semibold">
            {t("mergeSelectedTitle", { count: selectedEvents.length })}
          </h3>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-fg-muted">{t("mergeTargetLabel")}</legend>
            {selectedEvents.map((event) => (
              <label key={event.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="merge-target"
                  checked={event.id === effectiveTarget}
                  onChange={() => setTarget(event.id)}
                  className="h-4 w-4 accent-fg"
                />
                <span className="truncate">{event.title}</span>
                <span className="text-fg-subtle">· {event.meta}</span>
              </label>
            ))}
          </fieldset>

          {state.error && (
            <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
              {state.error === "lotteryConflict"
                ? t("mergeLotteryConflict")
                : t("mergeInvalid")}
            </p>
          )}

          <form action={formAction} className="flex items-center">
            <input type="hidden" name="targetId" value={effectiveTarget} />
            {selectedEvents.map((event) => (
              <input
                key={event.id}
                type="hidden"
                name="sourceId"
                value={event.id}
              />
            ))}
            <ConfirmSubmit
              label={
                pending
                  ? t("merging")
                  : t("mergeInto", { title: targetTitle })
              }
              confirmText={t("mergeConfirm", {
                title: targetTitle,
                count: selectedEvents.length - 1
              })}
            />
          </form>
        </div>
      )}
    </div>
  );
}
