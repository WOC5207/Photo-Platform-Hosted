import type { ReactNode } from "react";

export default function StatusMessage({
  kind,
  children
}: {
  kind: "success" | "error" | "info";
  children: ReactNode;
}) {
  const classes =
    kind === "success"
      ? "border-success-border bg-success-surface text-success-strong"
      : kind === "error"
        ? "border-danger-border bg-danger-surface text-danger-strong"
        : "border-accent/20 bg-accent-surface text-fg-muted";

  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`ui-pretty rounded-lg border px-4 py-3 text-sm leading-6 ${classes}`}
    >
      {children}
    </p>
  );
}
