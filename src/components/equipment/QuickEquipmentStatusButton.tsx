import type { QuickEquipmentStatus } from "@/lib/equipment";

const ACTIVE_CLASSES: Record<QuickEquipmentStatus, string> = {
  SIGNED_OUT: "border-accent/30 bg-accent-surface text-accent",
  IN_INVENTORY: "border-success-border bg-success-surface text-success-strong",
  BROKEN: "border-danger-border bg-danger-surface text-danger-strong"
};

export default function QuickEquipmentStatusButton({
  status,
  active,
  label,
  disabled
}: {
  status: QuickEquipmentStatus;
  active: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      name="status"
      value={status}
      aria-pressed={active}
      disabled={disabled || active}
      className={`min-h-10 flex-1 rounded-md border px-2.5 py-2 text-xs font-semibold transition-[color,background-color,border-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default max-sm:min-h-11 ${
        active
          ? ACTIVE_CLASSES[status]
          : "border-transparent text-fg-subtle hover:border-border hover:bg-control hover:text-fg disabled:opacity-45"
      }`}
    >
      {label}
    </button>
  );
}
