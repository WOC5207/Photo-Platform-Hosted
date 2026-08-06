import type { ReactNode } from "react";

/** Shared booking warning: displayed clock times belong to the event location. */
export default function EventLocalTimeNotice({
  marker,
  children,
  compact = false
}: {
  marker: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <aside
      role="note"
      className={`ui-pretty flex flex-col items-start gap-1.5 rounded-lg border border-warning-border bg-warning-surface text-fg-muted sm:flex-row sm:gap-3 ${
        compact ? "px-3 py-2.5" : "px-4 py-3"
      }`}
    >
      <span
        aria-hidden="true"
        className="font-meta mt-0.5 text-[0.6875rem] font-semibold tracking-[0.14em] text-warning sm:shrink-0"
      >
        {marker}
      </span>
      <p className="text-sm leading-6">{children}</p>
    </aside>
  );
}
