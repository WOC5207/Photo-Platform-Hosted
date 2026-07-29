// Shared classnames and byte formatting for the photo wizard steps.

export const inputCls =
  "min-h-11 min-w-0 w-full rounded-lg border border-border-strong bg-control px-3.5 py-2.5 text-sm text-fg outline-none transition-[border-color,background-color,box-shadow] hover:border-fg-faint focus-visible:border-accent/60 focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/20";

export const btnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong bg-raised px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-accent/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40 max-sm:min-h-11";

export const primaryBtnCls =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:opacity-40 dark:text-page";

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
