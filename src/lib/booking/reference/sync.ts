import "server-only";

// Reference-data sync: Airtable (bookings + HR) and Notion (roster) into the
// booking schema. All external sources are READ-ONLY; the only writes are to
// our own Postgres tables and Vercel Blob (staff photos).

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { getSql } from "@/lib/booking/db";
import { AIRTABLE_BOOKING_BASE_ID, AIRTABLE_HR_BASE_ID, listAll } from "./airtable.ts";
import { fetchBookingManagerRoster, fetchPodLeads } from "./notion.ts";
import {
  brandIdsForNames,
  buildApprovedLeave,
  buildDepartureIndex,
  computeCoverageIssues,
  isUpcomingDeparture,
  normalizeBookingManagers,
  normalizeEmail,
  staffSlug,
  type BrandRef,
  type CoverageIssueDraft,
  type NotionStaffRow,
  type StaffRowLite,
} from "./normalize.ts";

export const TRIP_FIELDS = [
  "Trip Title & Code",
  "Trip Name",
  "AUT: Nice Name",
  "Trip Coordinator",
  "Start Date",
  "Status",
  "Brand",
  "Website URL",
];

const BOOKING_MANAGER_FIELDS = ["Name", "Email", "Help Scout User ID", "AirCall User ID", "Slack User ID", "Status"];
const LEAVE_FIELDS = ["Team Member", "Start date", "End date", "Day part", "Status", "Leave Type"];
const TEAM_MEMBER_FIELDS = ["Name", "Company email", "Email", "Status", "Leave Team"];

export type ReferenceSyncSummary = {
  ok: boolean;
  durationMs: number;
  failures: Array<{ source: string; error: string }>;
  counts: {
    trips: number;
    bookingManagers: number;
    notionRoster: number;
    approvedLeave: number;
    staffInserted: number;
    staffUpdated: number;
    staffDeactivated: number;
    photosUploaded: number;
    issuesOpen: number;
    issuesResolved: number;
  };
};

type StaffDbRow = {
  id: string;
  email: string;
  full_name: string;
  slug: string;
  active: boolean;
  calendar_ok: boolean;
  calendar_checked_at: string | null;
  notion_page_id: string | null;
  photo_url: string | null;
  updated_at: string | null;
  brand_ids: string[];
};

async function selectStaffSnapshot(): Promise<StaffDbRow[]> {
  const sql = getSql();
  const rows = await sql`
    select s.id, s.email::text as email, s.full_name, s.slug::text as slug, s.active,
           s.calendar_ok, s.calendar_checked_at, s.notion_page_id, s.photo_url, s.updated_at,
           coalesce(array_agg(sb.brand_id) filter (where sb.brand_id is not null), '{}') as brand_ids
    from booking.staff s
    left join booking.staff_brand sb on sb.staff_id = s.id
    group by s.id
  `;
  return rows.map((row) => ({
    ...(row as Omit<StaffDbRow, "calendar_checked_at" | "updated_at">),
    calendar_checked_at: row.calendar_checked_at ? new Date(row.calendar_checked_at as string).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  })) as StaffDbRow[];
}

function toStaffLite(row: StaffDbRow): StaffRowLite {
  return {
    id: row.id,
    email: normalizeEmail(row.email),
    fullName: row.full_name,
    active: row.active,
    calendarOk: row.calendar_ok,
    calendarCheckedAt: row.calendar_checked_at,
    brandIds: row.brand_ids ?? [],
    notionPageId: row.notion_page_id,
  };
}

async function writeCache(key: string, payload: unknown): Promise<void> {
  const sql = getSql();
  await sql`
    insert into booking.reference_cache (key, payload, fetched_at)
    values (${key}, ${JSON.stringify(payload)}::jsonb, now())
    on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at
  `;
}

async function syncStaffPhoto(
  staffId: string,
  photoUrl: string,
): Promise<boolean> {
  const response = await fetch(photoUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`photo download failed with ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("photo download was empty");
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const blob = await put(`booking/staff/${hash}.jpg`, bytes, { access: "public", contentType });
  const sql = getSql();
  await sql`update booking.staff set photo_url = ${blob.url}, updated_at = now() where id = ${staffId}`;
  return true;
}

export async function runReferenceSync(): Promise<ReferenceSyncSummary> {
  const startedAt = Date.now();
  const sql = getSql();
  const today = new Date().toISOString().slice(0, 10);
  const failures: Array<{ source: string; error: string }> = [];

  async function attempt<T>(source: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      failures.push({ source, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  // ---- fetch all sources (tolerating individual failures) ----------------
  const trips = await attempt("airtable:trips", () => listAll(AIRTABLE_BOOKING_BASE_ID, "Trips", TRIP_FIELDS));
  const managerRecords = await attempt("airtable:booking-managers", () =>
    listAll(AIRTABLE_BOOKING_BASE_ID, "Booking Managers", BOOKING_MANAGER_FIELDS),
  );
  const hrLeave = await attempt("airtable:hr-leave", () => listAll(AIRTABLE_HR_BASE_ID, "Leave Requests", LEAVE_FIELDS));
  const hrTeam = await attempt("airtable:hr-team-members", () =>
    listAll(AIRTABLE_HR_BASE_ID, "Team Members", TEAM_MEMBER_FIELDS),
  );
  const notionRoster = await attempt("notion:staff", () => fetchBookingManagerRoster());
  const podLeads = await attempt("notion:pod-leads", () => fetchPodLeads());

  // ---- cache raw payloads -------------------------------------------------
  const cacheWrites: Array<[string, unknown]> = [];
  if (trips) cacheWrites.push(["airtable:trips", trips]);
  if (managerRecords) cacheWrites.push(["airtable:booking-managers", managerRecords]);
  if (hrLeave) cacheWrites.push(["airtable:hr-leave", hrLeave]);
  if (hrTeam) cacheWrites.push(["airtable:hr-team-members", hrTeam]);
  if (notionRoster) cacheWrites.push(["notion:staff", notionRoster]);
  for (const [key, payload] of cacheWrites) {
    await attempt(`cache:${key}`, () => writeCache(key, payload));
  }

  // ---- load booking schema state -----------------------------------------
  const brandRows = await sql`select id, key, name, aliases, active from booking.brand`;
  const brands: BrandRef[] = brandRows.map((row) => ({
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    aliases: (row.aliases as string[] | null) ?? [],
    active: row.active as boolean,
  }));

  const managers = normalizeBookingManagers(managerRecords ?? []);
  const managersByEmail = new Map(
    managers.filter((manager) => manager.email).map((manager) => [manager.email as string, manager]),
  );

  const preSyncStaff = await selectStaffSnapshot();
  const staffByEmail = new Map(preSyncStaff.map((row) => [normalizeEmail(row.email), row]));
  const staffByNotionId = new Map(
    preSyncStaff.filter((row) => row.notion_page_id).map((row) => [row.notion_page_id as string, row]),
  );
  const takenSlugs = new Set(preSyncStaff.map((row) => row.slug));

  // ---- upsert staff from the Notion roster joined to Airtable BMs --------
  let staffInserted = 0;
  let staffUpdated = 0;
  let staffDeactivated = 0;
  const staffIdByNotionPageId = new Map<string, string>();

  const roster: NotionStaffRow[] = notionRoster ?? [];
  for (const row of roster) {
    const email = normalizeEmail(row.email);
    // Rows without an email cannot be joined; computeCoverageIssues surfaces
    // them as notion-airtable-email-mismatch — never silently dropped.
    if (!email) continue;
    const manager = managersByEmail.get(email) ?? null;
    const fullName = row.name.trim().replace(/\s+/g, " ");
    const firstName = fullName.split(" ")[0] ?? fullName;
    const existing = staffByEmail.get(email) ?? staffByNotionId.get(row.notionPageId) ?? null;

    const applied = await attempt(`staff:${email}`, async () => {
      let staffId: string;
      if (existing) {
        await sql`
          update booking.staff set
            email = ${email},
            full_name = ${fullName},
            first_name = ${firstName},
            job_title = ${row.jobTitle ?? null},
            notion_page_id = ${row.notionPageId},
            helpscout_user_id = coalesce(${manager?.helpscoutUserId ?? null}, helpscout_user_id),
            aircall_user_id = coalesce(${manager?.aircallUserId ?? null}, aircall_user_id),
            slack_user_id = coalesce(${manager?.slackUserId ?? row.slackId ?? null}, slack_user_id),
            airtable_record_id = coalesce(${manager?.id ?? null}, airtable_record_id),
            active = true,
            updated_at = now()
          where id = ${existing.id}
        `;
        staffId = existing.id;
        staffUpdated += 1;
      } else {
        const slug = staffSlug(fullName, takenSlugs);
        const inserted = await sql`
          insert into booking.staff
            (email, full_name, first_name, slug, job_title, notion_page_id, helpscout_user_id,
             aircall_user_id, slack_user_id, airtable_record_id, active)
          values
            (${email}, ${fullName}, ${firstName}, ${slug}, ${row.jobTitle ?? null}, ${row.notionPageId},
             ${manager?.helpscoutUserId ?? null}, ${manager?.aircallUserId ?? null},
             ${manager?.slackUserId ?? row.slackId ?? null}, ${manager?.id ?? null}, true)
          returning id
        `;
        staffId = inserted[0].id as string;
        await sql`
          insert into booking.working_hours (staff_id, day_of_week, start_min, end_min)
          select ${staffId}, day, 540, 1020 from generate_series(1, 5) as day
        `;
        staffInserted += 1;
      }
      return staffId;
    });
    if (!applied) continue;
    staffIdByNotionPageId.set(row.notionPageId, applied);

    // Brand memberships: replace only when the Notion mapping is non-empty.
    const mappedBrandIds = brands.length > 0 ? brandIdsForNames(row.brands, brands).ids : [];
    if (mappedBrandIds.length > 0) {
      await attempt(`staff-brand:${email}`, async () => {
        await sql`delete from booking.staff_brand where staff_id = ${applied}`;
        for (const brandId of mappedBrandIds) {
          await sql`insert into booking.staff_brand (staff_id, brand_id) values (${applied}, ${brandId}) on conflict do nothing`;
        }
        await sql`update booking.staff set primary_brand_id = coalesce(primary_brand_id, ${mappedBrandIds[0]}) where id = ${applied}`;
        return true;
      });
    }
  }

  // ---- pods: each Pod Lead's brand set, from Notion Leadership ------------
  // Leads with identical brand sets share one pod (Olivia & Courtney both
  // cover Camino + Patch). Stored as derived reference data, not schema.
  if (podLeads && brands.length > 0) {
    const byBrandSet = new Map<string, { names: string[]; brandIds: string[] }>();
    for (const lead of podLeads) {
      const ids = [...new Set(brandIdsForNames(lead.brands, brands).ids)].sort();
      if (ids.length === 0) continue;
      const setKey = ids.join("|");
      const entry = byBrandSet.get(setKey) ?? { names: [], brandIds: ids };
      entry.names.push(lead.name.trim().split(/\s+/)[0] ?? lead.name);
      byBrandSet.set(setKey, entry);
    }
    // Pod display names (Nicola, 20 Aug): FenEx (Justin), PatchMino
    // (Courtney & Olivia), Launch Pad (Nicola). A future lead without a
    // christened pod falls back to "<First>'s pod" until named here.
    const POD_NAMES: Record<string, string> = {
      justin: "FenEx",
      courtney: "PatchMino",
      olivia: "PatchMino",
      nicola: "Launch Pad",
    };
    const pods = [...byBrandSet.values()]
      .map((entry) => {
        const names = [...new Set(entry.names)].sort();
        const christened = [...new Set(names.map((n) => POD_NAMES[n.toLowerCase()]).filter(Boolean))];
        const name = christened.length === 1 ? christened[0] : `${names.join(" & ")}'s pod`;
        return {
          key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          name,
          brandIds: entry.brandIds,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    await attempt("pods:cache", async () => {
      await sql`
        insert into booking.reference_cache (key, payload, fetched_at)
        values ('booking:pods', ${JSON.stringify({ pods })}::jsonb, now())
        on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`;
      return true;
    });
  }

  // ---- deactivate staff who left the roster (never delete) ---------------
  if (notionRoster && roster.length > 0) {
    const pageIds = roster.map((row) => row.notionPageId);
    const deactivated = await sql`
      update booking.staff set active = false, updated_at = now()
      where notion_page_id is not null and active = true and not (notion_page_id = any(${pageIds}))
      returning id
    `;
    staffDeactivated = deactivated.length;
  }

  // ---- staff photos → Vercel Blob ----------------------------------------
  let photosUploaded = 0;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    for (const row of roster) {
      if (!row.photoUrl) continue;
      const staffId = staffIdByNotionPageId.get(row.notionPageId);
      if (!staffId) continue;
      const before = staffByEmail.get(normalizeEmail(row.email)) ?? staffByNotionId.get(row.notionPageId) ?? null;
      const needsPhoto =
        !before ||
        before.photo_url === null ||
        (row.lastEdited !== null && before.updated_at !== null && row.lastEdited > before.updated_at);
      if (!needsPhoto) continue;
      const uploaded = await attempt(`photo:${row.notionPageId}`, () => syncStaffPhoto(staffId, row.photoUrl as string));
      if (uploaded) photosUploaded += 1;
    }
  }

  // ---- coverage issues ----------------------------------------------------
  const postSyncStaff = await selectStaffSnapshot();
  const staffLite = postSyncStaff.map(toStaffLite);
  const departureIndex = buildDepartureIndex(trips ?? [], brands);
  const leave = buildApprovedLeave(hrLeave ?? [], hrTeam ?? [], today);

  // Only reconcile kinds whose source data actually loaded, so a failed
  // fetch never falsely resolves open issues.
  const computedKinds = new Set<string>(["staff-calendar-unreachable", "calendar-never-checked"]);
  if (trips) {
    for (const kind of ["departure-no-coordinator", "departure-bad-url", "brand-unmapped", "brand-single-bm", "brand-no-bm"]) {
      computedKinds.add(kind);
    }
    if (managerRecords) computedKinds.add("coordinator-unknown");
  }
  if (notionRoster) {
    computedKinds.add("staff-brand-unmapped");
    if (managerRecords) computedKinds.add("notion-airtable-email-mismatch");
  }
  if (hrLeave && hrTeam) {
    computedKinds.add("leave-reduced-cover");
    computedKinds.add("leave-unjoined");
  }

  const allIssues: CoverageIssueDraft[] = [
    ...computeCoverageIssues({
      today,
      departures: departureIndex.departures,
      airtableManagers: managers,
      notionStaff: roster,
      staff: staffLite,
      brands,
      approvedLeave: leave.rows,
    }),
    ...leave.issues,
  ];
  const issues = allIssues.filter((issue) => computedKinds.has(issue.kind));

  for (const issue of issues) {
    await attempt(`issue:${issue.kind}:${issue.subjectRef}`, async () => {
      await sql`
        insert into booking.coverage_issue (kind, severity, subject_ref, message, detail, first_seen, last_seen, resolved_at)
        values (${issue.kind}, ${issue.severity}, ${issue.subjectRef}, ${issue.message},
                ${issue.detail ? JSON.stringify(issue.detail) : null}::jsonb, now(), now(), null)
        on conflict (kind, subject_ref) do update set
          severity = excluded.severity,
          message = excluded.message,
          detail = excluded.detail,
          last_seen = now(),
          resolved_at = null
      `;
      return true;
    });
  }

  const presentRefs = issues.map((issue) => `${issue.kind}::${issue.subjectRef}`);
  const resolved = await sql`
    update booking.coverage_issue set resolved_at = now()
    where resolved_at is null
      and kind = any(${[...computedKinds]})
      and not ((kind || '::' || subject_ref) = any(${presentRefs}))
    returning id
  `;

  // E2e slugs are no longer recorded (see recordUnresolvedSlug); retire any
  // rows written before that rule existed.
  await sql`
    update booking.coverage_issue set resolved_at = now()
    where resolved_at is null and kind = 'slug-unresolved' and subject_ref ilike '%e2e%'
  `;

  // A pool-fallback event is stale once its slug routes cleanly again: some
  // upcoming departure's coordinator is active staff. Guarded on both source
  // fetches so a failed load never falsely retires a live problem.
  if (trips && managerRecords) {
    const managerEmailById = new Map(
      managers.map((manager) => [manager.id, manager.email ? normalizeEmail(manager.email) : null]),
    );
    const activeStaffEmails = new Set(
      staffLite.filter((row) => row.active).map((row) => normalizeEmail(row.email)),
    );
    const routableSlugs = [
      ...new Set(
        departureIndex.departures
          .filter(
            (departure) =>
              departure.slug !== null &&
              isUpcomingDeparture(departure, today) &&
              departure.coordinatorAirtableIds.some((id) => {
                const email = managerEmailById.get(id) ?? null;
                return email !== null && activeStaffEmails.has(email);
              }),
          )
          .map((departure) => departure.slug as string),
      ),
    ];
    await sql`
      update booking.coverage_issue set resolved_at = now()
      where resolved_at is null and kind = 'trip-pool-fallback' and subject_ref = any(${routableSlugs})
    `;
  }

  const durationMs = Date.now() - startedAt;
  const summary: ReferenceSyncSummary = {
    ok: failures.length === 0,
    durationMs,
    failures,
    counts: {
      trips: trips?.length ?? 0,
      bookingManagers: managers.length,
      notionRoster: roster.length,
      approvedLeave: leave.rows.length,
      staffInserted,
      staffUpdated,
      staffDeactivated,
      photosUploaded,
      issuesOpen: issues.length,
      issuesResolved: resolved.length,
    },
  };

  await attempt("audit-log", async () => {
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values ('system', 'reference_sync', 'booking.reference', ${JSON.stringify({
        counts: summary.counts,
        failures,
        durationMs,
      })}::jsonb)
    `;
    return true;
  });

  return summary;
}
