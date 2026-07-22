/**
 * Slot times are stored as "naive" local times: the wall-clock time the admin
 * types is parsed as UTC and always formatted back as UTC. No timezone
 * conversion ever happens, so what you type is exactly what visitors see,
 * regardless of the server container's TZ setting.
 */

export function parseNaiveDateTime(value: string): Date | null {
  // Expects "YYYY-MM-DDTHH:MM" from <input type="datetime-local">
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${formatTime(d)}`;
}

export function formatSlotRange(start: Date, end: Date): string {
  return `${formatDate(start)} ${formatTime(start)}–${formatTime(end)}`;
}

/** Short label for a booking day tab, e.g. "Sat Jul 26" (naive-UTC). */
export function formatDayTab(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(d);
}

/** Format an event's date range; falls back gracefully when either end is unset. */
export function formatDateRange(
  start: Date | null,
  end: Date | null
): string {
  if (!start) return "";
  const s = formatDate(start);
  if (!end || end.getTime() === start.getTime()) return s;
  return `${s} – ${formatDate(end)}`;
}
