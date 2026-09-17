"use server";

// Integration health actions — Pod Lead only.

import { revalidatePath } from "next/cache";
import { requireBookingAccess } from "@/lib/booking/access";
import { getSql } from "@/lib/booking/db";
import { calendarConfigured } from "@/lib/booking/google/auth";
import { checkCalendarAccess, probeCalendar } from "@/lib/booking/google/calendar";
import { getCalltimeCalendar, saveCalltimeCalendar } from "@/lib/booking/calltime-calendar";
import { backfillSharedCalendar } from "@/lib/booking/calltime-backfill";
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

/**
 * Point CallTime at the shared calendar (Nicola, 17 Sep). The calendar is
 * created and shared in Google Calendar by a person; here we store its id
 * and the account the app acts as, after checking that account can write
 * to it. Pod Lead only.
 */
export async function saveCalltimeCalendarAction(formData: FormData): Promise<void> {
  const access = await requireBookingAccess("booking.manage");
  const calendarId = String(formData.get("calendarId") ?? "").trim();
  const actorEmail = String(formData.get("actorEmail") ?? "").trim().toLowerCase();
  const sql = getSql();
  if (!calendarId || !actorEmail) {
    await saveCalltimeCalendar(null);
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values (${access.identity.email}, 'calltime_calendar_cleared', 'calltime:calendar', '{}'::jsonb)`;
    revalidatePath("/booking/integrations");
    return;
  }
  const probe = calendarConfigured()
    ? await probeCalendar(actorEmail, calendarId)
    : { ok: false, error: "Google Calendar is not connected in this environment." };
  const previous = await getCalltimeCalendar();
  await saveCalltimeCalendar({
    calendarId,
    actorEmail,
    name: probe.ok ? (probe.name ?? previous?.name ?? null) : (previous?.name ?? null),
    checkedAt: new Date().toISOString(),
    lastError: probe.ok ? null : (probe.error ?? "unknown error"),
  });
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${access.identity.email}, 'calltime_calendar_set', 'calltime:calendar',
            ${JSON.stringify({ calendarId, actorEmail, ok: probe.ok, name: probe.name ?? null, error: probe.error ?? null })}::jsonb)`;
  revalidatePath("/booking/integrations");
}

/** Move every upcoming call still on a BM's own calendar onto CallTime Cal. Pod Lead only. */
export async function backfillCalltimeCalendarAction(): Promise<void> {
  const access = await requireBookingAccess("booking.manage");
  await backfillSharedCalendar(access.identity.email);
  revalidatePath("/booking/integrations");
  revalidatePath("/booking");
}

