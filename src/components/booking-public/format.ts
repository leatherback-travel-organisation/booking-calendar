// Pure date/time formatting for guest-facing pages. Everything renders in an
// explicit IANA timezone (the guest's browser zone once mounted), with the
// zone abbreviation shown next to every time so mismatches are spottable.

const DAY_MS = 86_400_000;

export function guestTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Short zone name for a given instant, e.g. "AEST". */
export function zoneAbbr(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone,
      hour: "numeric",
      timeZoneName: "short",
    }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "2:30pm AEST" — compact, always with the zone abbreviation. */
export function formatTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const period = get("dayPeriod").replace(/\s|\./g, "").toLowerCase();
  const zone = get("timeZoneName");
  return `${get("hour")}:${get("minute")}${period}${zone ? ` ${zone}` : ""}`;
}

/** "2:30pm" without the zone — for dense slot buttons under a zone header. */
export function formatTimeBare(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const period = get("dayPeriod").replace(/\s|\./g, "").toLowerCase();
  return `${get("hour")}:${get("minute")}${period}`;
}

/** Calendar-day key in a zone: "2026-08-17". en-CA reliably gives Y-M-D. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Tuesday 18 August" */
export function formatDayHeading(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

/** "Tue 18 Aug" */
export function formatDayShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** "Tuesday 18 August 2026, 2:30pm AEST" */
export function formatFullDateTime(iso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
  return `${day}, ${formatTime(iso, timeZone)}`;
}

/** "Tue 2:30pm" — for the backup list's "next available" line. */
export function formatSlotShort(iso: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short" }).format(new Date(iso));
  return `${weekday} ${formatTimeBare(iso, timeZone)}`;
}

export type DayGroup = { key: string; slots: { start: string; end: string }[] };

/** Group slots (already sorted by the API) by calendar day in a zone. */
export function groupSlotsByDay(slots: { start: string; end: string }[], timeZone: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const slot of slots) {
    const key = dayKey(slot.start, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.slots.push(slot);
    else groups.push({ key, slots: [slot] });
  }
  return groups;
}

/**
 * The set of 7 day-keys starting `page` weeks after today, in a zone.
 * Iterating instants at 24h steps and formatting per-zone sidesteps DST maths.
 */
export function weekDayKeys(page: number, timeZone: string, now = Date.now()): string[] {
  const keys: string[] = [];
  const startMs = now + page * 7 * DAY_MS;
  for (let i = 0; i < 7; i += 1) {
    keys.push(dayKey(new Date(startMs + i * DAY_MS).toISOString(), timeZone));
  }
  return keys;
}

/**
 * The week page (see weekDayKeys) containing the earliest slot, so the picker
 * can open on the first week that actually has availability. 0 when there are
 * no slots. Slots arrive sorted, so only the first one matters; week windows
 * are consecutive 7-day blocks, so the first window whose last day reaches the
 * slot's day is the one containing it.
 */
export function firstPageWithSlot(
  slots: readonly { start: string }[],
  timeZone: string,
  now = Date.now(),
): number {
  const first = slots[0];
  if (!first) return 0;
  const firstKey = dayKey(first.start, timeZone);
  for (let page = 0; page < 54; page += 1) {
    const keys = weekDayKeys(page, timeZone, now);
    if (keys[keys.length - 1] >= firstKey) return page;
  }
  return 0;
}
