export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return [DEFAULT_TIME_ZONE, ...zones.filter((zone) => zone !== DEFAULT_TIME_ZONE)];
}

/**
 * Represent an instant as the photographer's local wall clock using UTC
 * fields. Booking dates and slot times intentionally use these "naive UTC"
 * values so existing schedules keep their entered time when a zone changes.
 */
export function wallClockNow(
  timeZone: string,
  instant: Date = new Date()
): Date {
  const safeZone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return new Date(
    Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second")
    )
  );
}

export function todayInTimeZone(
  timeZone: string,
  instant: Date = new Date()
): string {
  return wallClockNow(timeZone, instant).toISOString().slice(0, 10);
}

export function isNaiveDateTimePast(
  dateTime: Date,
  timeZone: string,
  instant: Date = new Date()
): boolean {
  return dateTime.getTime() <= wallClockNow(timeZone, instant).getTime();
}

export function formatInstantInTimeZone(
  instant: Date,
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
  }).format(instant);
}
