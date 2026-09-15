// POST /api/booking/public/hold/release — drop a slot hold the moment the
// guest walks away (Nicola, 8 Sep). An abandoned scheduling request should
// leave nothing behind: the hold used to sit in the table for the rest of its
// 120 seconds, and the guest's chosen time sat there with it.
//
// Called from a pagehide handler via navigator.sendBeacon, so it must accept a
// beacon's POST body and answer without needing a readable response. Deleting
// a hold is harmless by design — holds are cosmetic, and the exclusion
// constraint is what actually prevents double-booking — so an id alone is
// enough to release one.

import { z } from "zod";
import { getSql } from "@/lib/booking/db";
import { clientIp, jsonResponse, rateLimited } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ReleaseSchema = z.object({ holdId: z.string().uuid() });

export async function POST(request: Request): Promise<Response> {
  // Generous: leaving a page can legitimately fire more than once (pagehide
  // after visibilitychange), and a blocked release is a row left behind.
  if (await rateLimited("hold-release-ip", clientIp(request), 60, 60)) {
    return jsonResponse({ error: "rate_limited" }, { status: 429 });
  }

  let parsed;
  try {
    // sendBeacon sends a Blob, so the body arrives as text either way.
    parsed = ReleaseSchema.parse(JSON.parse(await request.text()));
  } catch {
    return jsonResponse({ error: "invalid request" }, { status: 400 });
  }

  const sql = getSql();
  // Sweep whatever else has lapsed while we are here — a guest who closes the
  // tab is the most common way a hold is orphaned.
  await sql`delete from booking.slot_hold where id = ${parsed.holdId} or expires_at <= now()`;
  return jsonResponse({ ok: true });
}
