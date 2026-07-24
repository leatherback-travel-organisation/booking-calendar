const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses a date-only value without JavaScript's calendar rollover behaviour.
 * `new Date("2026-02-31")` becomes a March date; operational forms must reject it.
 */
export function parseIsoCalendarDate(value: string): Date | null {
  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function isIsoCalendarDateOnOrBefore(value: string, maximum: Date): boolean {
  const parsed = parseIsoCalendarDate(value);
  if (!parsed || Number.isNaN(maximum.valueOf())) return false;

  const maximumDay = Date.UTC(
    maximum.getUTCFullYear(),
    maximum.getUTCMonth(),
    maximum.getUTCDate(),
  );
  return parsed.valueOf() <= maximumDay;
}

/**
 * Accepts Airtable date-only values and RFC 3339 timestamps without allowing
 * JavaScript's calendar rollover behaviour or timezone-less timestamps.
 */
export function isIsoOperationalDate(value: string): boolean {
  if (parseIsoCalendarDate(value)) return true;
  const match = ISO_DATE_TIME.exec(value);
  if (!match || !parseIsoCalendarDate(match[1])) return false;
  return !Number.isNaN(new Date(value).valueOf());
}
