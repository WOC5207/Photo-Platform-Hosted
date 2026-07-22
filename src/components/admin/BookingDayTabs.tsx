"use client";

import { useState, type ReactNode } from "react";

export interface DayTab {
  id: string;
  label: string;
  /** Server-rendered content for the day (slot list + per-day slot adder). */
  content: ReactNode;
}

/**
 * Tabs for a multi-day event's availability: one tab per day. A single-day
 * event skips the tab strip entirely and just shows its one panel. Only the
 * active panel is mounted, so each day's slot-adder keeps its own fresh state.
 */
export default function BookingDayTabs({ tabs }: { tabs: DayTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  if (!active) return null;

  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const selected = tab.id === active.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(tab.id)}
                className={[
                  "inline-flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11",
                  selected
                    ? "border-fg bg-fg text-page"
                    : "border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      <div role="tabpanel">{active.content}</div>
    </div>
  );
}
