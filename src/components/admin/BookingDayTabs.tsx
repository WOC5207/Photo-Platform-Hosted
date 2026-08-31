"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

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
export default function BookingDayTabs({
  tabs,
  label
}: {
  tabs: DayTab[];
  label: string;
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  if (!active) return null;

  function selectAndFocus(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    setActiveId(tab.id);
    tabRefs.current.get(tab.id)?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectAndFocus(nextIndex);
  }

  return (
    <div className="flex flex-col gap-4">
      {tabs.length > 1 && (
        <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
          {tabs.map((tab, index) => {
            const selected = tab.id === active.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.id, node);
                  else tabRefs.current.delete(tab.id);
                }}
                id={`booking-day-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`booking-day-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveId(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={[
                  "inline-flex min-h-10 items-center rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 max-sm:min-h-11",
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
      <div
        id={`booking-day-panel-${active.id}`}
        role={tabs.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={
          tabs.length > 1 ? `booking-day-tab-${active.id}` : undefined
        }
      >
        {active.content}
      </div>
    </div>
  );
}
