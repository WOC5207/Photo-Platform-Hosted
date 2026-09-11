import type { ReactNode } from "react";

export default function FilterToolbar({
  label,
  count,
  children
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">{children}</div>
        {typeof count === "number" && (
          <p className="font-meta shrink-0 pb-2 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-subtle" aria-live="polite">
            {label}: {count}
          </p>
        )}
      </div>
    </div>
  );
}
