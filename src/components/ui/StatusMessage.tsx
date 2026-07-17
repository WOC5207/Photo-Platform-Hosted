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
        : "border-border bg-surface text-fg-muted";

  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${classes}`}
    >
      {children}
    </p>
  );
}
