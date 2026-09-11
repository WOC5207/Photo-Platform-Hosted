import type { ReactNode } from "react";

export default function StatusSegmentedControl({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 flex-wrap gap-1 rounded-lg bg-surface p-1"
    >
      {children}
    </div>
  );
}
