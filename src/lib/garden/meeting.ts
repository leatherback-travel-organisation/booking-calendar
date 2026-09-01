// Pure meeting-slot search: find the earliest 30-minute block inside every
// attendee's local working day (Mon–Fri, 09:00–17:00 in their own calendar
// timezone) that clears everyone's free/busy. Pure so it can be unit tested
// with fixed clocks; the Google plumbing lives in attention.ts.

export type BusyInterval = { start: string; end: string };

export type MeetingAttendee = {
  email: string;
  timezone: string;
  busy: BusyInterval[];
};

const STEP_MS = 30 * 60 * 1000;

function localParts(instant: number, timezone: string): { weekday: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

function withinWorkingDay(startMs: number, endMs: number, timezone: string): boolean {
  const start = localParts(startMs, timezone);
  if (start.weekday === "Sat" || start.weekday === "Sun") return false;
  if (start.hour < 9 || start.hour >= 17) return false;
  const end = localParts(endMs, timezone);
  if (end.hour < 9 || end.hour > 17 || (end.hour === 17 && end.minute > 0)) return false;
  return true;
}

function clashes(startMs: number, endMs: number, busy: BusyInterval[]): boolean {
  return busy.some((interval) => {
    const busyStart = Date.parse(interval.start);
    const busyEnd = Date.parse(interval.end);
    return startMs < busyEnd && busyStart < endMs;
  });
}

export function findMeetingSlot(input: {
  fromIso: string;
  horizonDays: number;
  durationMinutes: number;
  attendees: MeetingAttendee[];
}): { startIso: string; endIso: string } | null {
  if (input.attendees.length === 0) return null;
  const durationMs = input.durationMinutes * 60 * 1000;
  const from = Date.parse(input.fromIso);
  let cursor = Math.ceil(from / STEP_MS) * STEP_MS;
  const limit = from + input.horizonDays * 24 * 60 * 60 * 1000;

  while (cursor + durationMs <= limit) {
    const end = cursor + durationMs;
    const fits = input.attendees.every(
      (attendee) => withinWorkingDay(cursor, end, attendee.timezone) && !clashes(cursor, end, attendee.busy),
    );
    if (fits) {
      return { startIso: new Date(cursor).toISOString(), endIso: new Date(end).toISOString() };
    }
    cursor += STEP_MS;
  }
  return null;
}
