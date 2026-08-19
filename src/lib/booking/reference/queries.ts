import "server-only";

// Read helpers for the booking pages. Everything reads our own Postgres
// (booking schema) — external sources are only touched by the sync.

import { getSql } from "@/lib/booking/db";
import type { Brand, Departure, Staff } from "@/lib/booking/model";
import {
  buildDepartureIndex,
  isUpcomingDeparture,
  normalizeBookingManagers,
  type AirtableRecordLike,
  type BrandRef,
  type CoverageSeverity,
} from "./normalize.ts";

export const REFERENCE_CACHE_KEYS = [
  "airtable:trips",
  "airtable:booking-managers",
  "airtable:hr-leave",
  "airtable:hr-team-members",
  "notion:staff",
] as const;

export async function getBrands(): Promise<Brand[]> {
  const sql = getSql();
  const rows = await sql`select * from booking.brand order by name`;
  return rows.map((row) => ({
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    aliases: (row.aliases as string[] | null) ?? [],
    logoUrl: (row.logo_url as string | null) ?? null,
    colorPrimary: (row.color_primary as string | null) ?? null,
    colorAccent: (row.color_accent as string | null) ?? null,
    schedulingTimezone: row.scheduling_timezone as string,
    market: row.market as Brand["market"],
    phoneAu: (row.phone_au as string | null) ?? null,
    phoneNz: (row.phone_nz as string | null) ?? null,
    phoneDefault: (row.phone_default as string | null) ?? null,
    helpscoutMailboxId: row.helpscout_mailbox_id != null ? String(row.helpscout_mailbox_id) : null,
    fromEmail: row.from_email as string,
    fromName: row.from_name as string,
    replyTo: (row.reply_to as string | null) ?? null,
    active: row.active as boolean,
  }));
}

export async function getStaffWithBrands(): Promise<Staff[]> {
  const sql = getSql();
  const rows = await sql`
    select s.*, s.email::text as email, s.slug::text as slug,
           coalesce(array_agg(sb.brand_id) filter (where sb.brand_id is not null), '{}') as brand_ids
    from booking.staff s
    left join booking.staff_brand sb on sb.staff_id = s.id
    group by s.id
    order by s.active desc, s.full_name
  `;
  return rows.map((row) => ({
    id: row.id as string,
    email: row.email as string,
    fullName: row.full_name as string,
    firstName: row.first_name as string,
    slug: row.slug as string,
    primaryBrandId: (row.primary_brand_id as string | null) ?? null,
    brandIds: (row.brand_ids as string[] | null) ?? [],
    timezoneOverride: (row.timezone_override as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    photoUrl: (row.photo_url as string | null) ?? null,
    helpscoutUserId: row.helpscout_user_id != null ? String(row.helpscout_user_id) : null,
    aircallUserId: row.aircall_user_id != null ? String(row.aircall_user_id) : null,
    slackUserId: (row.slack_user_id as string | null) ?? null,
    airtableRecordId: (row.airtable_record_id as string | null) ?? null,
    bufferMinutes: Number(row.buffer_minutes ?? 0),
    minNoticeHours: Number(row.min_notice_hours ?? 0),
    bookingWindowDays: Number(row.booking_window_days ?? 0),
    reminder24hEnabled: row.reminder_24h_enabled === undefined ? true : Boolean(row.reminder_24h_enabled),
    reminder1hEnabled: row.reminder_1h_enabled === undefined ? true : Boolean(row.reminder_1h_enabled),
    canEditCommunications: Boolean(row.can_edit_communications),
    active: row.active as boolean,
    calendarOk: row.calendar_ok as boolean,
  }));
}

export type CoverageIssueRow = {
  id: string;
  kind: string;
  severity: CoverageSeverity;
  subjectRef: string;
  message: string;
  detail: Record<string, unknown> | null;
  firstSeen: string;
  lastSeen: string;
};

export async function getOpenCoverageIssues(): Promise<CoverageIssueRow[]> {
  const sql = getSql();
  const rows = await sql`
    select id, kind, severity, subject_ref, message, detail, first_seen, last_seen
    from booking.coverage_issue
    where resolved_at is null
    order by case severity when 'error' then 0 when 'warning' then 1 else 2 end, last_seen desc, kind, subject_ref
  `;
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.kind as string,
    severity: row.severity as CoverageSeverity,
    subjectRef: row.subject_ref as string,
    message: row.message as string,
    detail: (row.detail as Record<string, unknown> | null) ?? null,
    firstSeen: new Date(row.first_seen as string).toISOString(),
    lastSeen: new Date(row.last_seen as string).toISOString(),
  }));
}

function toBrandRefs(brands: Brand[]): BrandRef[] {
  return brands.map((brand) => ({
    id: brand.id,
    key: brand.key,
    name: brand.name,
    aliases: brand.aliases,
    active: brand.active,
  }));
}

async function readCache(): Promise<Map<string, { payload: unknown; fetchedAt: string }>> {
  const sql = getSql();
  const rows = await sql`
    select key, payload, fetched_at from booking.reference_cache
    where key = any(${[...REFERENCE_CACHE_KEYS]})
  `;
  return new Map(
    rows.map((row) => [
      row.key as string,
      { payload: row.payload as unknown, fetchedAt: new Date(row.fetched_at as string).toISOString() },
    ]),
  );
}

export async function getCachedDepartures(): Promise<Departure[]> {
  const [cache, brands] = await Promise.all([readCache(), getBrands()]);
  const trips = cache.get("airtable:trips")?.payload;
  if (!Array.isArray(trips)) return [];
  // Coordinator record ids only resolve to emails through the Booking
  // Managers cache — without this map every trip routes to the brand pool.
  const managerRecords = cache.get("airtable:booking-managers")?.payload;
  const emailByCoordinatorId = new Map<string, string>();
  if (Array.isArray(managerRecords)) {
    for (const manager of normalizeBookingManagers(managerRecords as AirtableRecordLike[])) {
      if (manager.email) emailByCoordinatorId.set(manager.id, manager.email);
    }
  }
  return buildDepartureIndex(trips as AirtableRecordLike[], toBrandRefs(brands), emailByCoordinatorId).departures;
}

export type DepartureStats = {
  totalUpcoming: number;
  perBrand: Array<{ key: string; name: string; upcoming: number }>;
  /** Last successful fetch time per reference_cache key (null if never). */
  fetchedAt: Record<string, string | null>;
  /** Most recent fetch across all cache keys, if any. */
  lastSyncedAt: string | null;
};

export async function getDepartureStats(): Promise<DepartureStats> {
  const [cache, brands] = await Promise.all([readCache(), getBrands()]);
  const fetchedAt: Record<string, string | null> = {};
  for (const key of REFERENCE_CACHE_KEYS) {
    fetchedAt[key] = cache.get(key)?.fetchedAt ?? null;
  }
  const timestamps = Object.values(fetchedAt).filter((value): value is string => Boolean(value));
  const lastSyncedAt = timestamps.length > 0 ? timestamps.sort().at(-1)! : null;

  const trips = cache.get("airtable:trips")?.payload;
  const today = new Date().toISOString().slice(0, 10);
  let totalUpcoming = 0;
  const perBrandCount = new Map<string, number>();
  if (Array.isArray(trips)) {
    const index = buildDepartureIndex(trips as AirtableRecordLike[], toBrandRefs(brands));
    for (const departure of index.departures) {
      if (!isUpcomingDeparture(departure, today)) continue;
      totalUpcoming += 1;
      const brandId = index.brandIdByAirtableId.get(departure.airtableId) ?? null;
      if (brandId) perBrandCount.set(brandId, (perBrandCount.get(brandId) ?? 0) + 1);
    }
  }
  const perBrand = brands
    .filter((brand) => brand.active)
    .map((brand) => ({ key: brand.key, name: brand.name, upcoming: perBrandCount.get(brand.id) ?? 0 }));

  return { totalUpcoming, perBrand, fetchedAt, lastSyncedAt };
}
