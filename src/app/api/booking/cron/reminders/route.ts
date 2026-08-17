// Reminder cron (*/5). Claim-then-send: the UPDATE...RETURNING is the lock.
// Claiming BEFORE sending means a crash mid-send costs at most one duplicate;
// claiming after would retry a crashed send every five minutes forever —
// duplicates annoy, loops are an incident. A failed send resets its flag so
// the next run retries. Also sweeps expired slot holds.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/booking/db";
import { sendBookingAlert } from "@/lib/booking/alerts";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { sendBookingEmail, type Moment } from "@/lib/booking/notify/messages";
import { derivedManageToken, manageTokenSecret } from "@/lib/booking/tokens";
import { appUrl } from "@/lib/booking/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

type ReminderKind = { moment: Moment; column: "reminder_24h_sent_at" | "reminder_1h_sent_at" };

async function claimDue(kind: ReminderKind): Promise<Array<Record<string, unknown>>> {
  const sql = getSql();
  if (kind.column === "reminder_24h_sent_at") {
    return sql`
      update booking.booking
         set reminder_24h_sent_at = now()
       where status = 'confirmed'
         and reminder_24h_sent_at is null
         and starts_at between now() + interval '23 hours' and now() + interval '25 hours'
      returning *`;
  }
  return sql`
    update booking.booking
       set reminder_1h_sent_at = now()
     where status = 'confirmed'
       and reminder_1h_sent_at is null
       and starts_at between now() + interval '30 minutes' and now() + interval '75 minutes'
    returning *`;
}

async function resetClaim(kind: ReminderKind, bookingId: string): Promise<void> {
  const sql = getSql();
  if (kind.column === "reminder_24h_sent_at") {
    await sql`update booking.booking set reminder_24h_sent_at = null where id = ${bookingId}`;
  } else {
    await sql`update booking.booking set reminder_1h_sent_at = null where id = ${bookingId}`;
  }
}

async function sendReminders(kind: ReminderKind): Promise<{ sent: number; failed: number }> {
  const claimed = await claimDue(kind);
  let sent = 0;
  let failed = 0;
  const secret = manageTokenSecret();
  for (const row of claimed) {
    const bookingId = String(row.id);
    try {
      const [staff, brand, eventType] = await Promise.all([
        getStaffById(String(row.staff_id)),
        getBrandById(String(row.brand_id)),
        getEventTypeById(String(row.event_type_id)),
      ]);
      if (!staff || !brand || !eventType) throw new Error("booking context missing");
      const manageUrlRaw = secret
        ? `${appUrl()}/manage/${derivedManageToken(bookingId, secret)}`
        : `${appUrl()}/book`;
      const result = await sendBookingEmail(kind.moment, {
        bookingId,
        guestName: String(row.guest_name),
        guestEmail: String(row.guest_email),
        guestTimezone: (row.guest_timezone as string | null) ?? null,
        startIso: new Date(row.starts_at as string).toISOString(),
        endIso: new Date(row.ends_at as string).toISOString(),
        durationMin: eventType.durationMin,
        meetUrl: (row.meet_url as string | null) ?? null,
        manageUrlRaw,
        brand,
        staff,
        eventType,
        icalSequence: Number(row.ical_sequence ?? 0),
      });
      if (!result.ok) throw new Error(result.error);
      sent += 1;
    } catch (error) {
      failed += 1;
      await resetClaim(kind, bookingId);
      await sendBookingAlert(
        `reminder-failed:${bookingId}:${kind.moment}`,
        `Reminder ${kind.moment} for booking ${bookingId} failed and will retry: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  return { sent, failed };
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sql = getSql();

  const [reminder24h, reminder1h] = [
    await sendReminders({ moment: "reminder_24h", column: "reminder_24h_sent_at" }),
    await sendReminders({ moment: "reminder_1h", column: "reminder_1h_sent_at" }),
  ];

  const swept = await sql`delete from booking.slot_hold where expires_at <= now() returning id`;

  // Heartbeat for the Integrations page ("cron last ran at…").
  await sql`
    insert into booking.reference_cache (key, payload, fetched_at)
    values ('cron:reminders-heartbeat', ${JSON.stringify({ reminder24h, reminder1h })}::jsonb, now())
    on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`;

  return NextResponse.json({
    reminder24h,
    reminder1h,
    holdsSwept: swept.length,
  });
}
