"use server";

// Integration health actions — Pod Lead only.

import { revalidatePath } from "next/cache";
import { requireBookingAccess } from "@/lib/booking/access";
import { getSql } from "@/lib/booking/db";
import { calendarConfigured } from "@/lib/booking/google/auth";
import { checkCalendarAccess } from "@/lib/booking/google/calendar";
import { runReferenceSync } from "@/lib/booking/reference/sync";

/**
 * Probe every active BM's calendar sequentially, persisting the result to
 * booking.staff (calendar_ok, calendar_checked_at) and the error text to
 * reference_cache so the page can show it.
 */
export async function testAllCalendars(): Promise<void> {
  const access = await requireBookingAccess("booking.manage");
  if (!calendarConfigured()) return;

  const sql = getSql();
  const rows = await sql`select id, email from booking.staff where active order by full_name`;
  let okCount = 0;
  let failedCount = 0;
  for (const row of rows) {
    const email = String(row.email);
    const result = await checkCalendarAccess(email);
    if (result.ok) okCount += 1;
    else failedCount += 1;
    await sql`
      update booking.staff
         set calendar_ok = ${result.ok}, calendar_checked_at = now()
       where id = ${String(row.id)}`;
    await sql`
      insert into booking.reference_cache (key, payload, fetched_at)
      values (${`calendar-check:${email.toLowerCase()}`}, ${JSON.stringify({ ok: result.ok, error: result.error ?? null })}::jsonb, now())
      on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`;
  }

  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${access.identity.email}, 'calendar_check_run', 'all-active-staff', ${JSON.stringify({
      ok: okCount,
      failed: failedCount,
    })}::jsonb)`;
  revalidatePath("/booking/integrations");
}

export async function runSyncNow(): Promise<void> {
  await requireBookingAccess("booking.manage");
  await runReferenceSync();
  revalidatePath("/booking/integrations");
  revalidatePath("/booking/routing");
  revalidatePath("/booking/team");
}
