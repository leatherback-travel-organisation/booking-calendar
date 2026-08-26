// READ-ONLY diagnostics: why didn't a booking notify anyone? Returns the
// last 24h of bookings with their notification outcomes, plus every
// notification-related audit row. Lives under /cron for the auth pattern
// (CRON_SECRET Bearer) and the canonical-host exemption — it exists because
// the DB is not always reachable from the laptop, while production plainly
// can reach its own database.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sql = getSql();
  const bookings = await sql`
    select b.id, b.created_at, b.guest_name, b.guest_email, b.guest_phone, b.source_kind,
           b.booked_by, b.status, b.helpscout_conversation_id,
           b.google_event_id is not null as has_calendar_event,
           s.full_name as bm, br.name as brand
      from booking.booking b
      join booking.staff s on s.id = b.staff_id
      join booking.brand br on br.id = b.brand_id
     where b.created_at > now() - interval '24 hours'
     order by b.created_at desc`;
  const audit = await sql`
    select created_at, actor, action, subject, detail
      from booking.audit_log
     where created_at > now() - interval '24 hours'
       and (action in ('email_rendered_not_sent', 'sms_rendered_not_sent', 'helpscout_stubbed', 'ops_alert')
            or action like '%fail%')
     order by created_at desc
     limit 60`;
  return NextResponse.json({ bookings, audit });
}
