"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { todayInTimeZone } from "@/lib/timeZone";

/** Inclusive list of yyyy-mm-dd strings from `a` to `b` (order-independent). */
function rangeBetween(a: string, b: string): string[] {
  const start = new Date(`${a}T00:00:00Z`);
  const end = new Date(`${b}T00:00:00Z`);
  const step = start <= end ? 1 : -1;
  const days: string[] = [];
  for (
    let d = new Date(start);
    step > 0 ? d <= end : d >= end;
    d.setUTCDate(d.getUTCDate() + step)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * A month calendar that lets the photographer pick the days an event spans:
 * click toggles a single day, drag paints a range, and Shift-click extends a
 * range from the last-clicked day (which also works across months). The
 * selection is emitted as a hidden `dates` input (JSON array) for the form.
 */
export default function BookingDayPicker({
  initialDates,
  timeZone,
  onSelectionChange
}: {
  initialDates: string[];
  timeZone: string;
  onSelectionChange?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("adminBookings");

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialDates)
  );
  const [view, setView] = useState(() => {
    const first = [...initialDates].sort()[0];
    const d = first ? new Date(`${first}T00:00:00Z`) : new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  // The last day clicked, used as the anchor for a Shift-click range. Kept
  // across month navigation so a range can span months.
  const anchorRef = useRef<string | null>(null);
  // While a pointer drag is in progress: the day it started on and where it is
  // now, so the covered range previews and commits on release.
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(Date.UTC(view.year, view.month, 1))),
    [locale, view]
  );

  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, {
      weekday: "narrow",
      timeZone: "UTC"
    });
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(Date.UTC(1970, 0, 4 + i)))
    );
  }, [locale]);

  const cells = useMemo(() => {
    const startOffset = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const daysInMonth = new Date(
      Date.UTC(view.year, view.month + 1, 0)
    ).getUTCDate();
    const items: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startOffset; i++) items.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      items.push({ day, dateStr });
    }
    return items;
  }, [view]);

  // The days the in-progress drag currently covers, shown as a live preview.
  const dragPreview = useMemo(
    () => (drag ? new Set(rangeBetween(drag.from, drag.to)) : null),
    [drag]
  );

  // A drag only commits when the pointer actually moved to another day (a plain
  // click is handled by onClick, which always fires and is what Playwright and
  // keyboard use). The commit runs on a global pointerup so a release outside
  // the grid still lands.
  useEffect(() => {
    if (!drag) return;
    function commit() {
      setDrag((current) => {
        if (current && current.from !== current.to) {
          const range = rangeBetween(current.from, current.to);
          setSelected((prev) => new Set([...prev, ...range]));
          onSelectionChange?.();
        }
        return null;
      });
    }
    window.addEventListener("pointerup", commit);
    return () => window.removeEventListener("pointerup", commit);
  }, [drag, onSelectionChange]);

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(Date.UTC(v.year, v.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  function onDayClick(
    dateStr: string,
    event: MouseEvent<HTMLButtonElement>
  ) {
    // Shift-click extends a range from the anchor; a plain click toggles the
    // single day. Guarded against a drag that happened to end on its start day.
    if (event.shiftKey && anchorRef.current) {
      const range = rangeBetween(anchorRef.current, dateStr);
      setSelected((prev) => new Set([...prev, ...range]));
      onSelectionChange?.();
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
    anchorRef.current = dateStr;
    onSelectionChange?.();
  }

  function onDayPointerDown(dateStr: string) {
    setDrag({ from: dateStr, to: dateStr });
  }

  function onDayPointerEnter(dateStr: string) {
    setDrag((current) => (current ? { ...current, to: dateStr } : null));
  }

  const selectedList = useMemo(
    () => [...selected].sort(),
    [selected]
  );
  const todayStr = todayInTimeZone(timeZone);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-fg-muted">{t("daysLabel")}</span>
      <div className="rounded-xl border border-border-strong bg-surface p-3 select-none">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={t("prevMonth")}
            onClick={() => shiftMonth(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-fg/10 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:h-9 sm:w-9"
          >
            ‹
          </button>
          <span className="text-sm font-semibold">{monthLabel}</span>
          <button
            type="button"
            aria-label={t("nextMonth")}
            onClick={() => shiftMonth(1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-fg/10 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:h-9 sm:w-9"
          >
            ›
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-fg-subtle">
          {weekdayLabels.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const isSelected = selected.has(cell.dateStr);
            const inDragPreview = dragPreview?.has(cell.dateStr) ?? false;
            const active = isSelected || inDragPreview;
            const isToday = cell.dateStr === todayStr;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={isSelected}
                aria-label={cell.dateStr}
                onClick={(event) => onDayClick(cell.dateStr, event)}
                onPointerDown={() => onDayPointerDown(cell.dateStr)}
                onPointerEnter={() => onDayPointerEnter(cell.dateStr)}
                className={[
                  "flex aspect-square items-center justify-center rounded-lg text-sm transition",
                  active
                    ? "bg-fg text-page"
                    : "text-fg hover:bg-fg/10",
                  !active && isToday ? "border border-fg/30" : ""
                ].join(" ")}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status" className="text-xs text-fg-subtle">
          {t("daysSelectedCount", { count: selected.size })}
        </span>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => {
            setSelected(new Set());
            anchorRef.current = null;
            onSelectionChange?.();
          }}
          className="inline-flex min-h-8 items-center rounded-lg border border-border-strong px-2 py-1 text-xs font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11"
        >
          {t("clearDays")}
        </button>
      </div>
      <p className="text-xs text-fg-subtle">{t("daysHint")}</p>

      {/* The form reads the selection from here. */}
      <input type="hidden" name="dates" value={JSON.stringify(selectedList)} />
    </div>
  );
}
