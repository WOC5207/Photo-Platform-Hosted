"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { todayInTimeZone } from "@/lib/timeZone";

export interface CalendarSession {
  date: string; // yyyy-mm-dd
  title: string;
  token: string;
  remaining: number;
}

type Cell = { day: number; dateStr: string };

export default function BookingCalendar({
  basePath,
  sessions,
  timeZone
}: {
  /** Root of the owner's site, e.g. "/u/alice" — locale is added by Link. */
  basePath: string;
  sessions: CalendarSession[];
  timeZone: string;
}) {
  const locale = useLocale();
  const t = useTranslations("home");

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions]);

  const [view, setView] = useState(() => {
    const first = sessions[0]?.date;
    const d = first ? new Date(`${first}T00:00:00Z`) : new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

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
    // 1970-01-04 was a Sunday (UTC); offset gives Sun..Sat.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(Date.UTC(1970, 0, 4 + i)))
    );
  }, [locale]);

  const cells = useMemo(() => {
    const startOffset = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
    const items: Array<Cell | null> = [];
    for (let i = 0; i < startOffset; i++) items.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      items.push({ day, dateStr });
    }
    return items;
  }, [view]);

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(Date.UTC(v.year, v.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  const todayStr = todayInTimeZone(timeZone);

  return (
    <div className="rounded-xl border border-border bg-surface/92 p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          {t("calendarTitle")}
        </h3>
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1 sm:flex">
          <button
            type="button"
            aria-label={t("calendarPrevMonth")}
            onClick={() => shiftMonth(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-accent-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-8 sm:w-8"
          >
            ‹
          </button>
          <span className="font-meta min-w-0 text-center text-[0.6875rem] text-fg-subtle sm:w-28">
            {monthLabel}
          </span>
          <button
            type="button"
            aria-label={t("calendarNextMonth")}
            onClick={() => shiftMonth(1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-accent-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-8 sm:w-8"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-fg-subtle">
        {weekdayLabels.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const daySessions = byDate.get(cell.dateStr) ?? [];
          const hasOpen = daySessions.some((s) => s.remaining > 0);
          const isToday = cell.dateStr === todayStr;
          const primary = daySessions[0];

          const inner = (
            <div
              className={[
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs",
                isToday ? "border border-accent/50 text-accent-strong" : "",
                daySessions.length > 0 ? "text-fg" : "text-fg-subtle"
              ].join(" ")}
            >
              <span>{cell.day}</span>
              {daySessions.length > 0 && (
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    hasOpen ? "bg-success" : "bg-fg-faint"
                  ].join(" ")}
                />
              )}
            </div>
          );

          return primary ? (
            <Link
              key={i}
              href={`/book/${primary.token}`}
              title={
                daySessions.length > 1
                  ? `${primary.title} +${daySessions.length - 1}`
                  : primary.title
              }
              className="rounded-lg transition hover:bg-accent-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {inner}
            </Link>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>

      {sessions.length === 0 ? (
        <p className="mt-3 text-center text-xs text-fg-subtle">
          {t("calendarEmpty")}
        </p>
      ) : (
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-fg-subtle">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {t("calendarLegendOpen")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" />
            {t("calendarLegendFull")}
          </span>
        </div>
      )}

      <Link
        href={`${basePath}/booking`}
        className="mt-3 flex min-h-11 items-center justify-center text-center text-xs text-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:min-h-8"
      >
        {t("calendarViewAll")}
      </Link>
    </div>
  );
}
