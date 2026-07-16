"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface CalendarSession {
  date: string; // yyyy-mm-dd
  title: string;
  token: string;
  remaining: number;
}

type Cell = { day: number; dateStr: string };

export default function BookingCalendar({
  sessions
}: {
  sessions: CalendarSession[];
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

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-fg/10 bg-page/85 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("calendarTitle")}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("calendarPrevMonth")}
            onClick={() => shiftMonth(-1)}
            className="rounded-md p-1 text-fg-subtle transition hover:bg-fg/10 hover:text-fg"
          >
            ‹
          </button>
          <span className="w-28 text-center text-xs text-fg-subtle">
            {monthLabel}
          </span>
          <button
            type="button"
            aria-label={t("calendarNextMonth")}
            onClick={() => shiftMonth(1)}
            className="rounded-md p-1 text-fg-subtle transition hover:bg-fg/10 hover:text-fg"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-fg-subtle">
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
                isToday ? "border border-fg/30" : "",
                daySessions.length > 0 ? "text-fg" : "text-fg-subtle"
              ].join(" ")}
            >
              <span>{cell.day}</span>
              {daySessions.length > 0 && (
                <span
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    hasOpen ? "bg-emerald-400" : "bg-fg-faint"
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
              className="rounded-lg transition hover:bg-fg/5"
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
        <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t("calendarLegendOpen")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" />
            {t("calendarLegendFull")}
          </span>
        </div>
      )}

      <Link
        href="/booking"
        className="mt-3 block text-center text-xs text-fg-subtle hover:text-fg"
      >
        {t("calendarViewAll")}
      </Link>
    </div>
  );
}
