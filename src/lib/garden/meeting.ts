// Pure meeting-slot search with comfort scoring. The best slot is the one
// that keeps everyone inside their own 9-5 weekday; when no such time exists
// the group can stretch into "funny hours" (early mornings and evenings —
// never nights, never weekends), because occasionally that's how a spread
// team meets. When even that fails, or someone is being stretched, single
// omissions are scored so the UI can offer "leave X out for a better time".
// Pure so it runs identically in tests; the Google plumbing lives in
// attention.ts.

export type BusyInterval = { start: string; end: string };

export type MeetingAttendee = {
  email: string;
  timezone: string;
  busy: BusyInterval[];
};

export type ComfortBand = "comfortable" | "early" | "late" | "rough";

export type ScoredSlot = {
  startIso: string;
  endIso: string;
  totalCost: number;
  /** 0 = everyone comfortable · 1 = someone in shoulder hours · 2 = someone rough */
  tier: 0 | 1 | 2;
  perAttendee: Array<{ email: string; band: ComfortBand }>;
};

export type OmissionOption = {
  omitEmail: string;
  slot: ScoredSlot;
};

const STEP_MS = 30 * 60 * 1000;
const BAND_COST: Record<ComfortBand, number> = { comfortable: 0, early: 2, late: 2, rough: 6 };

function localParts(instant: number, timezone: string): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** Comfort band for a slot in one attendee's local time; null = never book it. */
export function comfortBand(startMs: number, endMs: number, timezone: string): ComfortBand | null {
  const start = localParts(startMs, timezone);
  if (start.weekday === "Sat" || start.weekday === "Sun") return null;
  const end = localParts(endMs, timezone);
  const endsSameLocalDay = end.minutes > start.minutes;
  if (!endsSameLocalDay) return null;
  const from = start.minutes;
  const to = end.minutes;
  if (from >= 9 * 60 && to <= 17 * 60) return "comfortable";
  if (from >= 7 * 60 && to <= 17 * 60) return "early";
  if (from >= 9 * 60 && to <= 20 * 60) return "late";
  if (from >= 6 * 60 && to <= 22 * 60) return "rough";
  return null;
}

function clashes(startMs: number, endMs: number, busy: BusyInterval[]): boolean {
  return busy.some((interval) => {
    const busyStart = Date.parse(interval.start);
    const busyEnd = Date.parse(interval.end);
    return startMs < busyEnd && busyStart < endMs;
  });
}

function scoreSlot(startMs: number, endMs: number, attendees: MeetingAttendee[]): ScoredSlot | null {
  const perAttendee: ScoredSlot["perAttendee"] = [];
  let totalCost = 0;
  let tier: 0 | 1 | 2 = 0;
  for (const attendee of attendees) {
    const band = comfortBand(startMs, endMs, attendee.timezone);
    if (band === null || clashes(startMs, endMs, attendee.busy)) return null;
    perAttendee.push({ email: attendee.email, band });
    totalCost += BAND_COST[band];
    if (band === "rough") tier = 2;
    else if (band !== "comfortable" && tier < 1) tier = 1;
  }
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    totalCost,
    tier,
    perAttendee,
  };
}

function better(candidate: ScoredSlot, incumbent: ScoredSlot | null): boolean {
  if (!incumbent) return true;
  if (candidate.tier !== incumbent.tier) return candidate.tier < incumbent.tier;
  if (candidate.totalCost !== incumbent.totalCost) return candidate.totalCost < incumbent.totalCost;
  return Date.parse(candidate.startIso) < Date.parse(incumbent.startIso);
}

/**
 * The best slot in the window: everyone-comfortable beats everything (earliest
 * such slot wins); otherwise the least-stretched slot, earliest on ties.
 */
export function findBestMeetingSlot(input: {
  fromIso: string;
  horizonDays: number;
  durationMinutes: number;
  attendees: MeetingAttendee[];
}): ScoredSlot | null {
  if (input.attendees.length === 0) return null;
  const durationMs = input.durationMinutes * 60 * 1000;
  const from = Date.parse(input.fromIso);
  let cursor = Math.ceil(from / STEP_MS) * STEP_MS;
  const limit = from + input.horizonDays * 24 * 60 * 60 * 1000;

  let best: ScoredSlot | null = null;
  while (cursor + durationMs <= limit) {
    const scored = scoreSlot(cursor, cursor + durationMs, input.attendees);
    if (scored) {
      if (scored.tier === 0) return scored; // earliest fully-comfortable slot
      if (better(scored, best)) best = scored;
    }
    cursor += STEP_MS;
  }
  return best;
}

/**
 * Single omissions that genuinely improve the meeting: dropping this person
 * either finds a slot where none existed, lowers the tier, or removes at
 * least one stretched attendee. Sorted best-first, capped at `limit`.
 */
export function suggestOmissions(input: {
  fromIso: string;
  horizonDays: number;
  durationMinutes: number;
  attendees: MeetingAttendee[];
  fullGroupSlot: ScoredSlot | null;
  limit?: number;
}): OmissionOption[] {
  if (input.attendees.length <= 2) return [];
  const options: OmissionOption[] = [];
  for (const omit of input.attendees) {
    const rest = input.attendees.filter((attendee) => attendee.email !== omit.email);
    const slot = findBestMeetingSlot({
      fromIso: input.fromIso,
      horizonDays: input.horizonDays,
      durationMinutes: input.durationMinutes,
      attendees: rest,
    });
    if (!slot) continue;
    const improves =
      input.fullGroupSlot === null ||
      slot.tier < input.fullGroupSlot.tier ||
      (slot.tier === input.fullGroupSlot.tier && slot.totalCost <= input.fullGroupSlot.totalCost - BAND_COST.early);
    if (improves) options.push({ omitEmail: omit.email, slot });
  }
  options.sort((a, b) =>
    a.slot.tier !== b.slot.tier
      ? a.slot.tier - b.slot.tier
      : a.slot.totalCost !== b.slot.totalCost
        ? a.slot.totalCost - b.slot.totalCost
        : Date.parse(a.slot.startIso) - Date.parse(b.slot.startIso),
  );
  return options.slice(0, input.limit ?? 3);
}
