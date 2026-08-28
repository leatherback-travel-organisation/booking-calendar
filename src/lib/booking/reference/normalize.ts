// Pure normalisation + coverage logic for the booking reference sync.
// No I/O, no server-only imports — everything here is unit tested with
// `node --experimental-strip-types --test`.

import type { Departure, Interval } from "../model.ts";
import { parseTourUrl, slugKey } from "../slug.ts";

// ---------------------------------------------------------------------------
// Shared row shapes
// ---------------------------------------------------------------------------

/** A raw Airtable record as returned by the REST API (and as cached). */
export type AirtableRecordLike = {
  id: string;
  fields: Record<string, unknown>;
};

export type BrandRef = {
  id: string;
  key: string;
  name: string;
  aliases: string[];
  active?: boolean;
};

/** Normalised row from the Airtable `Booking Managers` table. */
export type BookingManagerRecord = {
  id: string;
  name: string | null;
  email: string | null;
  helpscoutUserId: string | null;
  aircallUserId: string | null;
  slackUserId: string | null;
  status: string | null;
};

/** Normalised row from the Notion Team Directory (Booking Manager filter). */
export type NotionStaffRow = {
  notionPageId: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
  brands: string[];
  /** Brands this BM backs up — pool member, not their displayed brand. */
  backupBrands?: string[];
  location: string | null;
  phone: string | null;
  slackId: string | null;
  /** Signed S3 URL — expires within about an hour. Never store directly. */
  photoUrl: string | null;
  lastEdited: string | null;
};

/** The slice of a booking.staff row the coverage checks need. */
export type StaffRowLite = {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  calendarOk: boolean;
  calendarCheckedAt: string | null;
  brandIds: string[];
  notionPageId: string | null;
};

/** Approved leave joined to an email (raw keeps the original Status value). */
export type LeaveRow = {
  email: string;
  startDate: string; // ISO date, inclusive
  endDate: string; // ISO date, inclusive
  raw: string;
};

export type CoverageSeverity = "error" | "warning" | "info";

export type CoverageIssueDraft = {
  kind: string;
  severity: CoverageSeverity;
  subjectRef: string;
  message: string;
  detail?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** First entry of an Airtable lookup/array field, as a trimmed string. */
export function firstString(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof candidate === "number") return String(candidate);
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** ISO date (YYYY-MM-DD) plus N days, in UTC. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const sliced = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(sliced) ? sliced : null;
}

// ---------------------------------------------------------------------------
// Brand alias matching
// ---------------------------------------------------------------------------

/**
 * Resolve free-text brand names (Airtable `Brand`, Notion `Brand`) to booking
 * brand ids. Matching is alias-aware and normalised through slugKey so
 * 'Fencox' matches key `fencox` and 'Magnificent Rail' matches the
 * magnificent-explorers alias. Unknown names are returned so callers can
 * surface them — never silently dropped.
 */
export function brandIdsForNames(
  names: string[],
  brands: BrandRef[],
): { ids: string[]; unmatched: string[] } {
  const byKey = new Map<string, string>();
  for (const brand of brands) {
    byKey.set(brand.key, brand.id);
    byKey.set(slugKey(brand.name), brand.id);
    for (const alias of brand.aliases) {
      const key = slugKey(alias);
      if (key) byKey.set(key, brand.id);
    }
  }
  const ids: string[] = [];
  const unmatched: string[] = [];
  for (const name of names) {
    const key = slugKey(name);
    const id = key ? byKey.get(key) : undefined;
    if (!id) {
      unmatched.push(name);
    } else if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return { ids, unmatched };
}

// ---------------------------------------------------------------------------
// Booking Managers + leave normalisation
// ---------------------------------------------------------------------------

export function normalizeBookingManagers(records: AirtableRecordLike[]): BookingManagerRecord[] {
  return records.map((record) => {
    const rawName = record.fields["Name"];
    const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : null;
    const email = normalizeEmail(typeof record.fields["Email"] === "string" ? (record.fields["Email"] as string) : null);
    const toText = (value: unknown): string | null => {
      if (typeof value === "number") return String(value);
      if (typeof value === "string" && value.trim()) return value.trim();
      return null;
    };
    return {
      id: record.id,
      name: name || null,
      email: email || null,
      helpscoutUserId: toText(record.fields["Help Scout User ID"]),
      aircallUserId: toText(record.fields["AirCall User ID"]),
      slackUserId: toText(record.fields["Slack User ID"]),
      status: firstString(record.fields["Status"]),
    };
  });
}

/**
 * Join HR `Leave Requests` to `Team Members` by record link, keeping only
 * approved rows. Requests that cannot be joined to an email are returned as
 * coverage issues (kind `leave-unjoined`) rather than dropped.
 */
export function buildApprovedLeave(
  leaveRecords: AirtableRecordLike[],
  teamRecords: AirtableRecordLike[],
  today: string,
): { rows: LeaveRow[]; issues: CoverageIssueDraft[] } {
  const teamById = new Map<string, { name: string | null; email: string }>();
  for (const record of teamRecords) {
    const name = firstString(record.fields["Name"]);
    const email = normalizeEmail(
      firstString(record.fields["Company email"]) ?? firstString(record.fields["Email"]),
    );
    teamById.set(record.id, { name, email });
  }

  const rows: LeaveRow[] = [];
  const issues: CoverageIssueDraft[] = [];
  for (const record of leaveRecords) {
    const status = firstString(record.fields["Status"]) ?? "";
    if (!/approv/i.test(status)) continue;
    const startDate = isoDate(firstString(record.fields["Start date"]));
    const endDate = isoDate(firstString(record.fields["End date"]));
    if (!startDate || !endDate) continue;
    const memberId = stringArray(record.fields["Team Member"])[0] ?? null;
    const member = memberId ? teamById.get(memberId) : undefined;
    if (!member || !member.email) {
      if (endDate >= today) {
        issues.push({
          kind: "leave-unjoined",
          severity: "warning",
          subjectRef: record.id,
          message: `Approved leave ${startDate} → ${endDate} cannot be joined to a team member email.`,
          detail: { memberId, memberName: member?.name ?? null, startDate, endDate },
        });
      }
      continue;
    }
    rows.push({ email: member.email, startDate, endDate, raw: status });
  }
  return { rows, issues };
}

// ---------------------------------------------------------------------------
// Departure index
// ---------------------------------------------------------------------------

export type DepartureIndex = {
  departures: Departure[];
  /**
   * Lookup keyed by `${host}::${slugKey(slug)}` and, host-agnostically, by
   * `::${slugKey(slug)}`. Buckets are sorted by startDate ascending (nulls
   * last).
   */
  bySlug: Map<string, Departure[]>;
  /** airtableId → resolved booking brand id (null when Brand is unmapped). */
  brandIdByAirtableId: Map<string, string | null>;
};

export function departureLookupKey(host: string | null, slug: string): string {
  return `${host ?? ""}::${slugKey(slug)}`;
}

export function buildDepartureIndex(
  tripsRecords: AirtableRecordLike[],
  brands: BrandRef[],
  emailByCoordinatorId?: Map<string, string>,
): DepartureIndex {
  const departures: Departure[] = [];
  const brandIdByAirtableId = new Map<string, string | null>();

  for (const record of tripsRecords) {
    const fields = record.fields;
    const titleAndCode = firstString(fields["Trip Title & Code"]) ?? record.id;
    const websiteUrl = firstString(fields["Website URL"]);
    const parsed = parseTourUrl(websiteUrl);
    const coordinatorAirtableIds = stringArray(fields["Trip Coordinator"]);
    const brandName = firstString(fields["Brand"]);
    const departure: Departure = {
      airtableId: record.id,
      titleAndCode,
      tripName: firstString(fields["Trip Name"]) ?? titleAndCode,
      niceName: firstString(fields["AUT: Nice Name"]),
      brandName,
      status: firstString(fields["Status"]),
      startDate: isoDate(firstString(fields["Start Date"])),
      countries: stringArray(fields["Countries Visited"]),
      regions: stringArray(fields["Regions Visited"]),
      websiteUrl,
      host: parsed?.host ?? null,
      slug: parsed?.slug ?? null,
      coordinatorAirtableIds,
      coordinatorEmails: emailByCoordinatorId
        ? coordinatorAirtableIds
            .map((id) => emailByCoordinatorId.get(id))
            .filter((email): email is string => Boolean(email))
        : [],
    };
    departures.push(departure);
    brandIdByAirtableId.set(
      record.id,
      brandName ? (brandIdsForNames([brandName], brands).ids[0] ?? null) : null,
    );
  }

  const bySlug = new Map<string, Departure[]>();
  for (const departure of departures) {
    if (!departure.slug) continue;
    const keys = [departureLookupKey(departure.host, departure.slug), departureLookupKey(null, departure.slug)];
    for (const key of keys) {
      const bucket = bySlug.get(key);
      if (bucket) bucket.push(departure);
      else bySlug.set(key, [departure]);
    }
  }
  for (const bucket of bySlug.values()) {
    bucket.sort((a, b) => {
      if (a.startDate === b.startDate) return a.airtableId.localeCompare(b.airtableId);
      if (a.startDate === null) return 1;
      if (b.startDate === null) return -1;
      return a.startDate < b.startDate ? -1 : 1;
    });
  }

  return { departures, bySlug, brandIdByAirtableId };
}

// ---------------------------------------------------------------------------
// Staff slugs
// ---------------------------------------------------------------------------

/**
 * kebab-case first-name + last-name, de-duplicated with a -2/-3 suffix.
 * The chosen slug is added to `taken`.
 */
export function staffSlug(fullName: string, taken: Set<string>): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const base =
    slugKey(words.length >= 2 ? `${words[0]} ${words[words.length - 1]}` : (words[0] ?? "")) || "staff";
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------
// Coverage issues
// ---------------------------------------------------------------------------

const ACTIONABLE_STATUSES = new Set(["Published", "Marketing Ready"]);

// Ops conventions: trips with "Ceco" in the title are operational test
// fixtures, and "Private Trip" departures are sold outside the public
// funnel — neither ever needs call routing, so neither may raise coverage
// issues.
export function isCallRoutingExempt(titleAndCode: string | null): boolean {
  const title = titleAndCode ?? "";
  return /ceco/i.test(title) || /^\s*private trip\b/i.test(title);
}

export function isUpcomingDeparture(departure: Departure, today: string): boolean {
  return (
    departure.startDate !== null &&
    departure.startDate >= today &&
    departure.status !== null &&
    ACTIONABLE_STATUSES.has(departure.status)
  );
}

export type CoverageInputs = {
  /** ISO date, e.g. "2026-08-17". */
  today: string;
  departures: Departure[];
  airtableManagers: BookingManagerRecord[];
  notionStaff: NotionStaffRow[];
  staff: StaffRowLite[];
  brands: BrandRef[];
  approvedLeave: LeaveRow[];
};

export function computeCoverageIssues(inputs: CoverageInputs): CoverageIssueDraft[] {
  const { today, departures, airtableManagers, notionStaff, staff, brands, approvedLeave } = inputs;
  const issues: CoverageIssueDraft[] = [];

  const activeStaff = staff.filter((row) => row.active);
  const activeStaffEmails = new Set(activeStaff.map((row) => normalizeEmail(row.email)));
  const managerById = new Map(airtableManagers.map((manager) => [manager.id, manager]));
  const activeBrands = brands.filter((brand) => brand.active !== false);
  const upcoming = departures.filter(
    (departure) => isUpcomingDeparture(departure, today) && !isCallRoutingExempt(departure.titleAndCode),
  );

  const brandIdForName = (name: string | null): string | null =>
    name ? (brandIdsForNames([name], brands).ids[0] ?? null) : null;

  // --- departure-no-coordinator ------------------------------------------
  for (const departure of upcoming) {
    if (departure.coordinatorAirtableIds.length > 0) continue;
    issues.push({
      kind: "departure-no-coordinator",
      severity: "error",
      subjectRef: departure.airtableId,
      message: `${departure.titleAndCode} departs ${departure.startDate} with no Trip Coordinator assigned.`,
      detail: { url: departure.websiteUrl, startDate: departure.startDate, trip: departure.titleAndCode },
    });
  }

  // --- coordinator-unknown -----------------------------------------------
  for (const departure of upcoming) {
    for (const coordinatorId of departure.coordinatorAirtableIds) {
      const manager = managerById.get(coordinatorId) ?? null;
      const email = manager?.email ? normalizeEmail(manager.email) : null;
      let problem: string | null = null;
      if (!manager) problem = "the coordinator record is not in Booking Managers";
      else if (!email) problem = `${manager.name ?? "the coordinator"} has no email in Airtable`;
      else if (!activeStaffEmails.has(email)) problem = `${email} is not an active Booking Manager in Cove`;
      if (!problem) continue;
      issues.push({
        kind: "coordinator-unknown",
        severity: "error",
        subjectRef: `${departure.airtableId}:${coordinatorId}`,
        message: `${departure.titleAndCode} (${departure.startDate}) cannot be routed — ${problem}.`,
        detail: {
          url: departure.websiteUrl,
          trip: departure.titleAndCode,
          coordinatorId,
          coordinatorName: manager?.name ?? null,
          coordinatorEmail: email,
        },
      });
    }
  }

  // --- staff calendar checks ---------------------------------------------
  for (const row of activeStaff) {
    if (row.calendarCheckedAt === null) {
      issues.push({
        kind: "calendar-never-checked",
        severity: "info",
        subjectRef: normalizeEmail(row.email),
        message: `${row.fullName}'s calendar has never been checked.`,
      });
    } else if (!row.calendarOk) {
      issues.push({
        kind: "staff-calendar-unreachable",
        severity: "error",
        subjectRef: normalizeEmail(row.email),
        message: `${row.fullName}'s calendar is unreachable — availability cannot be computed.`,
        detail: { checkedAt: row.calendarCheckedAt },
      });
    }
  }

  // --- brand staffing pools ----------------------------------------------
  const upcomingCountByBrandId = new Map<string, number>();
  for (const departure of upcoming) {
    const brandId = brandIdForName(departure.brandName);
    if (!brandId) continue;
    upcomingCountByBrandId.set(brandId, (upcomingCountByBrandId.get(brandId) ?? 0) + 1);
  }
  for (const brand of activeBrands) {
    const upcomingCount = upcomingCountByBrandId.get(brand.id) ?? 0;
    if (upcomingCount === 0) continue;
    const pool = activeStaff.filter((row) => row.brandIds.includes(brand.id));
    if (pool.length === 0) {
      issues.push({
        kind: "brand-no-bm",
        severity: "error",
        subjectRef: brand.key,
        message: `${brand.name} has ${upcomingCount} upcoming departure${upcomingCount === 1 ? "" : "s"} and no active Booking Manager.`,
        detail: { upcomingCount },
      });
    } else if (pool.length < 2) {
      issues.push({
        kind: "brand-single-bm",
        severity: "warning",
        subjectRef: brand.key,
        message: `${brand.name} has a single active Booking Manager (${pool[0].fullName}) — no backup is possible.`,
        detail: { upcomingCount, staff: pool.map((row) => normalizeEmail(row.email)) },
      });
    }
  }

  // --- notion-airtable-email-mismatch ------------------------------------
  const managerEmails = new Set(
    airtableManagers
      .map((manager) => (manager.email ? normalizeEmail(manager.email) : null))
      .filter((email): email is string => Boolean(email)),
  );
  for (const row of notionStaff) {
    const email = normalizeEmail(row.email);
    if (!email) {
      issues.push({
        kind: "notion-airtable-email-mismatch",
        severity: "warning",
        subjectRef: `notion:${row.notionPageId}`,
        message: `${row.name} has no email in the Notion roster, so they cannot be joined to Airtable.`,
      });
      continue;
    }
    if (!managerEmails.has(email)) {
      issues.push({
        kind: "notion-airtable-email-mismatch",
        severity: "warning",
        subjectRef: email,
        message: `${row.name}'s Notion email (${email}) is not among the Airtable Booking Managers — routing joins on email will miss them.`,
        detail: { name: row.name },
      });
    }
  }

  // --- departure-bad-url --------------------------------------------------
  for (const departure of upcoming) {
    if (departure.host !== null && departure.slug !== null) continue;
    issues.push({
      kind: "departure-bad-url",
      severity: "warning",
      subjectRef: departure.airtableId,
      message: departure.websiteUrl
        ? `${departure.titleAndCode} has an unparseable Website URL ("${departure.websiteUrl}").`
        : `${departure.titleAndCode} has no Website URL, so guests cannot be matched to it.`,
      detail: { url: departure.websiteUrl, trip: departure.titleAndCode },
    });
  }

  // --- brand-unmapped ------------------------------------------------------
  const unmappedByName = new Map<string, Departure[]>();
  for (const departure of upcoming) {
    if (departure.brandName && brandIdForName(departure.brandName) !== null) continue;
    const label = departure.brandName ?? "(missing)";
    const bucket = unmappedByName.get(label);
    if (bucket) bucket.push(departure);
    else unmappedByName.set(label, [departure]);
  }
  for (const [name, bucket] of unmappedByName) {
    issues.push({
      kind: "brand-unmapped",
      severity: "warning",
      subjectRef: slugKey(name) || "missing",
      message: `Brand "${name}" on ${bucket.length} upcoming departure${bucket.length === 1 ? "" : "s"} does not match any booking brand.`,
      detail: {
        brandName: name,
        count: bucket.length,
        trips: bucket.slice(0, 5).map((departure) => departure.titleAndCode),
      },
    });
  }

  // --- staff-brand-unmapped -----------------------------------------------
  for (const row of notionStaff) {
    const { ids } = brandIdsForNames(row.brands, brands);
    if (ids.length > 0) continue;
    issues.push({
      kind: "staff-brand-unmapped",
      severity: "info",
      subjectRef: row.notionPageId,
      message:
        row.brands.length > 0
          ? `${row.name}'s Notion brands (${row.brands.join(", ")}) map to no booking brand.`
          : `${row.name} has no Brand set in the Notion roster.`,
      detail: { brands: row.brands },
    });
  }

  // --- leave-reduced-cover -------------------------------------------------
  const leaveByEmail = new Map<string, Array<{ start: string; end: string }>>();
  for (const leave of approvedLeave) {
    const email = normalizeEmail(leave.email);
    if (!email) continue;
    const bucket = leaveByEmail.get(email);
    const interval = { start: leave.startDate, end: leave.endDate };
    if (bucket) bucket.push(interval);
    else leaveByEmail.set(email, [interval]);
  }

  for (const brand of activeBrands) {
    const pool = activeStaff.filter((row) => row.brandIds.includes(brand.id));
    const merged: Array<{ email: string; start: string; end: string }> = [];
    for (const member of pool) {
      const intervals = leaveByEmail.get(normalizeEmail(member.email));
      if (!intervals || intervals.length === 0) continue;
      const sorted = [...intervals].sort((a, b) => (a.start < b.start ? -1 : 1));
      let current = { ...sorted[0] };
      for (const interval of sorted.slice(1)) {
        if (interval.start <= addDays(current.end, 1)) {
          if (interval.end > current.end) current.end = interval.end;
        } else {
          merged.push({ email: normalizeEmail(member.email), ...current });
          current = { ...interval };
        }
      }
      merged.push({ email: normalizeEmail(member.email), ...current });
    }
    if (merged.length < 2) continue;

    // Sweep day boundaries: +1 at start, -1 the day after end (inclusive dates).
    const events = new Map<string, number>();
    for (const interval of merged) {
      events.set(interval.start, (events.get(interval.start) ?? 0) + 1);
      const after = addDays(interval.end, 1);
      events.set(after, (events.get(after) ?? 0) - 1);
    }
    const boundaries = [...events.keys()].sort();
    let count = 0;
    let windowStart: string | null = null;
    let windowMax = 0;
    for (const boundary of boundaries) {
      const next = count + (events.get(boundary) ?? 0);
      if (count < 2 && next >= 2) {
        windowStart = boundary;
        windowMax = next;
      } else if (count >= 2 && next >= 2) {
        windowMax = Math.max(windowMax, next);
      } else if (count >= 2 && next < 2 && windowStart) {
        const windowEnd = addDays(boundary, -1);
        if (windowEnd >= today) {
          const overlapping = merged.filter(
            (interval) => interval.start <= windowEnd && interval.end >= windowStart!,
          );
          issues.push({
            kind: "leave-reduced-cover",
            severity: "warning",
            subjectRef: `${brand.key}:${windowStart}`,
            message: `${brand.name}: ${windowMax} Booking Managers have overlapping approved leave ${windowStart} → ${windowEnd} — cover is reduced.`,
            detail: {
              windowStart,
              windowEnd,
              count: windowMax,
              staff: [...new Set(overlapping.map((interval) => interval.email))],
            },
          });
        }
        windowStart = null;
        windowMax = 0;
      }
      count = next;
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// leave-no-calendar-block — designed now, wired in Phase 3 when busy data
// from Google Calendar becomes available. Exported separately on purpose.
// ---------------------------------------------------------------------------

export type LeaveCalendarInputs = {
  today: string;
  approvedLeave: LeaveRow[];
  /**
   * Busy intervals per (normalised) email. Presence of a key means the
   * calendar was fetched; emails absent from the map are skipped, because an
   * unfetched calendar is not the same as an empty one.
   */
  busyByEmail: Map<string, Interval[]>;
};

export function computeLeaveCalendarBlockIssues(inputs: LeaveCalendarInputs): CoverageIssueDraft[] {
  const { today, approvedLeave, busyByEmail } = inputs;
  const issues: CoverageIssueDraft[] = [];
  for (const leave of approvedLeave) {
    const email = normalizeEmail(leave.email);
    if (!email || !busyByEmail.has(email)) continue;
    if (leave.endDate < today) continue;
    const busy = busyByEmail.get(email) ?? [];
    const missingDays: string[] = [];
    let day = leave.startDate >= today ? leave.startDate : today;
    while (day <= leave.endDate) {
      const dayStart = Date.parse(`${day}T00:00:00Z`);
      const dayEnd = Date.parse(`${addDays(day, 1)}T00:00:00Z`);
      const covered = busy.some((interval) => {
        const start = Date.parse(interval.start);
        const end = Date.parse(interval.end);
        return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd && end > dayStart;
      });
      if (!covered) missingDays.push(day);
      day = addDays(day, 1);
    }
    if (missingDays.length === 0) continue;
    issues.push({
      kind: "leave-no-calendar-block",
      severity: "error",
      subjectRef: `${email}:${leave.startDate}`,
      message: `${email} has approved leave ${leave.startDate} → ${leave.endDate} but no calendar block on ${missingDays.length} day${missingDays.length === 1 ? "" : "s"} — guests could book them while away.`,
      detail: { missingDays, startDate: leave.startDate, endDate: leave.endDate },
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Brand identity (logos + palettes from the company Brands base)
// ---------------------------------------------------------------------------

export type BrandIdentity = {
  name: string;
  colorPrimary: string | null;
  colorAccent: string | null;
  logo: { url: string; filename: string; size: number } | null;
};

const HEX_RE = /#?([0-9a-fA-F]{6})\b/g;

/**
 * The "Brand Colours" field is prose. Every hex is collected in order; when
 * an entry's surrounding words mention buttons or CTAs (Harriet's palette
 * documents roles), that hex wins primary — otherwise the first one does.
 * Accent is the next distinct hex.
 */
export function parseBrandColours(text: string | null): { primary: string | null; accent: string | null } {
  if (!text) return { primary: null, accent: null };
  const found: Array<{ hex: string; context: string }> = [];
  const paragraphs = text.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    for (const match of paragraph.matchAll(HEX_RE)) {
      found.push({ hex: `#${match[1].toLowerCase()}`, context: paragraph.toLowerCase() });
    }
  }
  if (found.length === 0) return { primary: null, accent: null };
  // "secondary buttons" (Harriet's Misty Harbour) is not the button colour.
  const button = found.find((entry) => /button|cta/.test(entry.context) && !/secondary button/.test(entry.context));
  const primary = (button ?? found[0]).hex;
  const accent = found.map((entry) => entry.hex).find((hex) => hex !== primary) ?? null;
  return { primary, accent };
}

/**
 * Pick the logo attachment guests should see: images only, and variants
 * named grayscale/negative/secondary lose to anything else.
 */
export function pickBrandLogo(
  attachments: unknown,
): { url: string; filename: string; size: number } | null {
  if (!Array.isArray(attachments)) return null;
  const images = attachments.filter(
    (a): a is { url: string; filename: string; size: number; type: string; width?: number; height?: number } =>
      Boolean(a && typeof a === "object" && typeof (a as { url?: unknown }).url === "string" &&
        /^image\//.test(String((a as { type?: unknown }).type ?? ""))),
  );
  if (images.length === 0) return null;
  // Preference order (Nicola, 27-28 Aug): the main mark over grayscale/
  // negative/secondary variants, PNG over JPEG (transparency), and a
  // horizontal wordmark over a stacked lockup when the file offers one.
  const score = (a: { filename: string; width?: number; height?: number }) => {
    const horizontal = a.width && a.height && a.width / a.height >= 2 ? 1 : 0;
    return (/grayscale|negative|secondary/i.test(a.filename) ? 0 : 8) + (/\.png$/i.test(a.filename) ? 4 : 0) + horizontal * 2;
  };
  const best = [...images].sort((a, b) => score(b) - score(a))[0];
  return { url: best.url, filename: best.filename, size: best.size };
}

export function parseBrandIdentities(records: AirtableRecordLike[]): BrandIdentity[] {
  const identities: BrandIdentity[] = [];
  for (const record of records) {
    const name = firstString(record.fields["Name"]);
    if (!name) continue;
    const colours = parseBrandColours(firstString(record.fields["Brand Colours"]));
    identities.push({
      name,
      colorPrimary: colours.primary,
      colorAccent: colours.accent,
      logo: pickBrandLogo(record.fields["Logo"]),
    });
  }
  return identities;
}
