// The resolution chain (§4.2). Routing is DERIVED, never configured: the
// trip→BM mapping is read live from Airtable's Trip Coordinator field via the
// reference cache. There is no routing-rules table, and there never will be.
//
// Rule 2 lives here: a missing/unreachable primary NEVER becomes a silent
// substitution. The guest either sees the honest brand pool, or chooses a
// backup themselves behind "Can't find a time that works?".

import "server-only";

import { getSql } from "./db";
import type { Brand, Departure, Staff } from "./model";
import { slugKey } from "./slug";
import { getStaffByEmail, getStaffBySlug } from "./availability/service";
import { isCallRoutingExempt } from "./reference/normalize.ts";
import { getBrands, getCachedDepartures } from "./reference/queries";

export type ResolvedManager =
  | {
      kind: "primary";
      staff: Staff;
      brand: Brand;
      departures: Departure[];
      reason: string;
    }
  | {
      kind: "pool";
      brand: Brand;
      departures: Departure[];
      /** Honest label: "Book a call with the <Brand> team". */
      reason: string;
    }
  | { kind: "unresolved" };

export type ResolveInput =
  | { bmSlug: string }
  | { tripSlug: string; host?: string | null }
  | { tripRecordId: string };

export async function resolveManager(input: ResolveInput): Promise<ResolvedManager> {
  if ("bmSlug" in input) {
    return resolveByBm(input.bmSlug);
  }
  if ("tripRecordId" in input) {
    return resolveByTripRecord(input.tripRecordId);
  }
  return resolveByTrip(input.tripSlug, input.host ?? null);
}

/**
 * Guest-portal entry: the portal knows the exact Airtable trip record the
 * guest booked, so resolution is a direct lookup — no slug matching, no
 * status/date guessing. The guest legitimately holds this trip.
 */
async function resolveByTripRecord(tripRecordId: string): Promise<ResolvedManager> {
  const [departures, brands] = await Promise.all([getCachedDepartures(), getBrands()]);
  const departure = departures.find((d) => d.airtableId === tripRecordId) ?? null;
  if (!departure) {
    // An empty cache (before the first sync) is not a data problem —
    // recording it would only leave stale notes on the coverage map.
    if (departures.length > 0) await recordUnresolvedSlug(`record:${tripRecordId}`, null);
    return { kind: "unresolved" };
  }
  const brand = brandForDeparture(departure, brands);
  if (!brand) {
    await recordUnresolvedSlug(`record:${tripRecordId}`, null);
    return { kind: "unresolved" };
  }
  for (const email of departure.coordinatorEmails) {
    const staff = await getStaffByEmail(email);
    if (staff && staff.active) {
      return {
        kind: "primary",
        staff,
        brand,
        departures: [departure],
        reason: "Trip coordinator of the guest's booked departure.",
      };
    }
  }
  if (!isCallRoutingExempt(departure.titleAndCode)) {
    await recordPoolFallback(departure.slug ?? `record:${tripRecordId}`, brand);
  }
  return {
    kind: "pool",
    brand,
    departures: [departure],
    reason: `No reachable Booking Manager for this trip — offering the ${brand.name} team.`,
  };
}

async function resolveByBm(bmSlug: string): Promise<ResolvedManager> {
  const staff = await getStaffBySlug(bmSlug);
  if (!staff) return { kind: "unresolved" };
  const brands = await getBrands();
  const brand =
    brands.find((b) => b.id === staff.primaryBrandId) ??
    brands.find((b) => staff.brandIds.includes(b.id));
  if (!brand) return { kind: "unresolved" };
  return { kind: "primary", staff, brand, departures: [], reason: "Direct booking link." };
}

async function resolveByTrip(tripSlug: string, host: string | null): Promise<ResolvedManager> {
  const [departures, brands] = await Promise.all([getCachedDepartures(), getBrands()]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = departures.filter(
    (d) =>
      (d.status === "Published" || d.status === "Marketing Ready") &&
      d.startDate !== null &&
      d.startDate >= today,
  );

  const wanted = tripSlug.toLowerCase();
  const wantedKey = slugKey(tripSlug);
  const hostMatches = (d: Departure) => host === null || d.host === null || d.host === host.toLowerCase().replace(/^www\./, "");

  // Tier 1: exact slug match (host-aware when the caller knows its host).
  let matched = upcoming.filter((d) => d.slug === wanted && hostMatches(d));
  // Tier 2: normalised match.
  if (matched.length === 0) {
    matched = upcoming.filter((d) => d.slug !== null && slugKey(d.slug) === wantedKey && hostMatches(d));
  }
  // Tier 3: normalised trip-name match.
  if (matched.length === 0) {
    matched = upcoming.filter((d) => slugKey(d.tripName || d.titleAndCode) === wantedKey);
  }
  // Tier 4: an unrecognised host (staging, localhost, a future rebrand)
  // must not block a perfectly good slug — retry host-blind.
  if (matched.length === 0 && host !== null) {
    matched = upcoming.filter((d) => d.slug === wanted || (d.slug !== null && slugKey(d.slug) === wantedKey));
  }
  if (matched.length === 0) {
    if (upcoming.length > 0) await recordUnresolvedSlug(tripSlug, host);
    return { kind: "unresolved" };
  }

  matched.sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
  const brand = brandForDeparture(matched[0], brands);
  if (!brand) {
    await recordUnresolvedSlug(tripSlug, host);
    return { kind: "unresolved" };
  }

  // Primary = coordinator of the soonest upcoming departure. When departures
  // of this tour have different coordinators, the page lets the guest pick a
  // departure — each departure keeps its own BM. No merging, no swapping.
  for (const departure of matched) {
    for (const email of departure.coordinatorEmails) {
      const staff = await getStaffByEmail(email);
      if (staff && staff.active) {
        return {
          kind: "primary",
          staff,
          brand,
          departures: matched,
          reason:
            departure === matched[0]
              ? "Trip coordinator of the next departure."
              : `Trip coordinator of the ${departure.startDate} departure (earlier departures had no reachable coordinator).`,
        };
      }
    }
  }

  // No reachable coordinator: honest pool, loud coverage note (§4.2 step 3).
  // Ops fixtures (Ceco tests, Private Trips) fall back silently — they are
  // exempt from coverage by decision, so a lookup must not re-flag them.
  if (!isCallRoutingExempt(matched[0].titleAndCode)) {
    await recordPoolFallback(tripSlug, brand);
  }
  return {
    kind: "pool",
    brand,
    departures: matched,
    reason: `No reachable Booking Manager for this trip — offering the ${brand.name} team.`,
  };
}

function brandForDeparture(departure: Departure, brands: Brand[]): Brand | null {
  if (departure.brandName) {
    const byAlias = brands.find(
      (b) => b.name === departure.brandName || b.aliases.includes(departure.brandName!),
    );
    if (byAlias) return byAlias;
  }
  return null;
}

async function recordUnresolvedSlug(tripSlug: string, host: string | null): Promise<void> {
  // E2e probes request unresolvable slugs on purpose; recording them would
  // fill the coverage map with operational noise.
  if (/e2e/i.test(tripSlug)) return;
  const sql = getSql();
  const subjectRef = `${host ?? "any"}:${tripSlug}`.slice(0, 200);
  await sql`
    insert into booking.coverage_issue (kind, severity, subject_ref, message, detail)
    values ('slug-unresolved', 'info', ${subjectRef},
      ${`No live departure resolves the slug "${tripSlug}"${host ? ` (from ${host})` : ""}. The guest was shown the trip picker instead.`},
      ${JSON.stringify({ tripSlug, host })}::jsonb)
    on conflict (kind, subject_ref) do update
      set last_seen = now(), resolved_at = null, message = excluded.message`;
}

async function recordPoolFallback(tripSlug: string, brand: Brand): Promise<void> {
  const sql = getSql();
  await sql`
    insert into booking.coverage_issue (kind, severity, subject_ref, message, detail)
    values ('trip-pool-fallback', 'error', ${tripSlug},
      ${`Guests booking "${tripSlug}" are getting the ${brand.name} pool — the trip's coordinator is missing or not a known Booking Manager.`},
      ${JSON.stringify({ tripSlug, brandKey: brand.key })}::jsonb)
    on conflict (kind, subject_ref) do update
      set last_seen = now(), resolved_at = null, message = excluded.message`;
}
