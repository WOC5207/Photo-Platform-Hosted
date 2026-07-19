// Shared classnames and byte formatting for the photo wizard steps.

export const inputCls =
  "min-h-10 min-w-0 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

export const btnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11";

export const primaryBtnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index++) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

export function formatUploadLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} MB` : formatBytes(bytes);
}
