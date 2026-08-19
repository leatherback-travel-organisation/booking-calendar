import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { SettingsSearch } from "@/components/booking/settings-search";
import { formatRelative, minutesSince } from "@/components/booking/dashboard/relative";
import { requireBookingAccess } from "@/lib/booking/access";
import { aircallConfigured, aircallPing } from "@/lib/booking/aircall";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { calendarConfigured } from "@/lib/booking/google/auth";
import { helpscoutConfigured } from "@/lib/booking/helpscout";
import { runSyncNow, testAllCalendars } from "./actions";
import shellStyles from "@/components/booking/booking-shell.module.css";
import styles from "@/components/booking/integrations/integrations.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations · Calltime · Cove",
};

type Tone = "green" | "amber" | "red" | "grey";

function toneForAge(ageMinutes: number | null, greenBelow: number, amberBelow: number): Tone {
  if (ageMinutes === null) return "red";
  if (ageMinutes < greenBelow) return "green";
  if (ageMinutes < amberBelow) return "amber";
  return "red";
}

type StaffCheck = {
  id: string;
  fullName: string;
  email: string;
  helpscoutOk: boolean;
  aircallOk: boolean;
  calendarOk: boolean;
  checkedAt: string | null;
  error: string | null;
};

export default async function BookingIntegrationsPage() {
  const { canManage } = await requireBookingAccess("booking.manage");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="integrations" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const sql = getSql();
  const [staffRows, cacheRows] = await Promise.all([
    sql`select id, email, full_name, calendar_ok, calendar_checked_at, aircall_user_id, helpscout_user_id from booking.staff where active order by full_name`,
    sql`
      select key, payload, fetched_at from booking.reference_cache
      where key in ('airtable:trips', 'notion:staff', 'cron:reminders-heartbeat') or key like 'calendar-check:%'`,
  ]);

  const cache = new Map(
    cacheRows.map((row) => [
      String(row.key),
      { payload: row.payload as Record<string, unknown> | null, fetchedAt: new Date(row.fetched_at as string).toISOString() },
    ]),
  );

  const googleConfigured = calendarConfigured();
  const staffChecks: StaffCheck[] = staffRows.map((row) => {
    const email = String(row.email).toLowerCase();
    const check = cache.get(`calendar-check:${email}`);
    const payloadError = check?.payload && typeof check.payload.error === "string" ? check.payload.error : null;
    return {
      id: String(row.id),
      fullName: String(row.full_name),
      email,
      helpscoutOk: row.helpscout_user_id != null && String(row.helpscout_user_id).trim() !== "",
      aircallOk: row.aircall_user_id != null && String(row.aircall_user_id).trim() !== "",
      calendarOk: Boolean(row.calendar_ok),
      checkedAt: row.calendar_checked_at ? new Date(row.calendar_checked_at as string).toISOString() : null,
      error: payloadError,
    };
  });
  const okCount = staffChecks.filter((check) => check.calendarOk).length;
  const googleTone: Tone = !googleConfigured ? "grey" : okCount === staffChecks.length ? "green" : "red";
  const googleStatus = !googleConfigured
    ? "Not configured — GOOGLE_SA_KEY_B64 is missing, guests cannot see availability."
    : `Connected — ${okCount} of ${staffChecks.length} active BM calendars verified.`;

  const airtable = cache.get("airtable:trips");
  const airtableAge = minutesSince(airtable?.fetchedAt ?? null);
  const notion = cache.get("notion:staff");
  const notionAge = minutesSince(notion?.fetchedAt ?? null);

  const cron = cache.get("cron:reminders-heartbeat");
  const cronAge = minutesSince(cron?.fetchedAt ?? null);
  const cronTone = toneForAge(cronAge, 10, 31);
  const cronStatus =
    cronAge === null
      ? "The reminders cron has never run."
      : cronAge > 30
        ? `cron has not run for ${cronAge} minutes — reminders are not being sent.`
        : `Heartbeat healthy — last run ${formatRelative(cron?.fetchedAt ?? null)}.`;

  const aircallOn = aircallConfigured();
  const aircall = aircallOn ? await aircallPing() : null;
  const aircallUserCount = staffRows.filter((row) => row.aircall_user_id != null && String(row.aircall_user_id).trim() !== "").length;
  const aircallTone: Tone = !aircallOn ? "grey" : aircall?.ok ? "green" : "red";
  const aircallStatus = !aircallOn
    ? "Off — no API key; Call buttons record dial intents to the audit log."
    : aircall?.ok
      ? `Connected — dialing is live. ${aircallUserCount} of ${staffRows.length} active BMs have an Aircall user ID (synced from Airtable).`
      : `API key set but the check failed: ${aircall?.detail ?? "unknown error"}.`;

  const resendLive = process.env.BOOKING_NOTIFIER === "live" && Boolean(process.env.RESEND_API_KEY);
  const slackOn = Boolean(process.env.BOOKING_SLACK_WEBHOOK_URL);
  const turnstileOn = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const helpscoutOn = helpscoutConfigured();

  return (
    <BookingShell active="integrations" canManage={canManage}>
      <div className={styles.board}>
        <p className={styles.intro}>
          Connection health for everything the booking flow depends on — the 9am &ldquo;what&rsquo;s broken?&rdquo;
          answer. Green means recently verified; red needs action now.
        </p>

        <ul className={styles.list}>
          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={googleTone} />
              <span className={styles.name}>Google Calendar</span>
              <span className={styles.status} data-tone={googleTone === "red" ? "red" : undefined}>
                {googleStatus}
              </span>
            </div>
            {googleConfigured ? (
              <form action={testAllCalendars}>
                <button type="submit" className={styles.actionButton}>
                  Test all calendars
                </button>
              </form>
            ) : null}
          </li>
          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={toneForAge(airtableAge, 30, 120)} />
              <span className={styles.name}>Airtable trips</span>
              <span className={styles.status} data-tone={toneForAge(airtableAge, 30, 120) === "red" ? "red" : undefined}>
                {airtable ? `Last synced ${formatRelative(airtable.fetchedAt)}.` : "Never synced."}
              </span>
            </div>
            <form action={runSyncNow}>
              <button type="submit" className={styles.actionButton}>
                Run sync now
              </button>
            </form>
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={toneForAge(notionAge, 30, 120)} />
              <span className={styles.name}>Notion staff</span>
              <span className={styles.status} data-tone={toneForAge(notionAge, 30, 120) === "red" ? "red" : undefined}>
                {notion ? `Last synced ${formatRelative(notion.fetchedAt)}.` : "Never synced."}
              </span>
            </div>
            <span className={styles.when}>Synced together with Airtable</span>
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={cronTone} />
              <span className={styles.name}>Reminders cron</span>
              <span className={styles.status} data-tone={cronTone === "red" ? "red" : undefined}>
                {cronStatus}
              </span>
            </div>
            {cron ? <span className={styles.when}>{formatRelative(cron.fetchedAt)}</span> : null}
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={aircallTone} />
              <span className={styles.name}>Aircall</span>
              <span className={styles.status} data-tone={aircallTone === "red" ? "red" : undefined}>
                {aircallStatus}
              </span>
            </div>
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={resendLive ? "green" : "grey"} />
              <span className={styles.name}>Resend email</span>
              <span className={styles.status}>
                {resendLive ? "Live — guest emails are sent via Resend." : "Stub — emails are rendered and logged, not sent."}
              </span>
            </div>
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={helpscoutOn ? "green" : "grey"} />
              <span className={styles.name}>Help Scout</span>
              <span className={styles.status}>
                {helpscoutOn ? "Connected — booking notes post to mailboxes." : "Stubbed — notes are recorded locally only."}
              </span>
            </div>
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={slackOn ? "green" : "grey"} />
              <span className={styles.name}>Slack alerts</span>
              <span className={styles.status}>
                {slackOn ? "Webhook configured — failures alert the pod channel." : "Off — no webhook configured."}
              </span>
            </div>
          </li>

          <li className={styles.row}>
            <div className={styles.rowMain}>
              <i className={styles.dot} data-tone={turnstileOn ? "green" : "amber"} />
              <span className={styles.name}>Turnstile</span>
              <span className={styles.status}>
                {turnstileOn ? "Enforced — public booking forms are bot-checked." : "Off — dev mode, no bot check on public forms."}
              </span>
            </div>
          </li>
        </ul>

        <section className={styles.connections} aria-label="Per-BM connections">
          <h2 className={styles.connectionsTitle}>Who&rsquo;s connected to what</h2>
          <p className={styles.connectionsHint}>
            Help Scout and Aircall come from each BM&rsquo;s user ID in Airtable (fix there, then re-sync);
            Calendar is the result of the last calendar test.
          </p>
          <div className={styles.staffTableWrap}>
            <table className={styles.staffTable}>
              <thead>
                <tr>
                  <th scope="col">Booking Manager</th>
                  <th scope="col">Help Scout</th>
                  <th scope="col">Aircall</th>
                  <th scope="col">Calendar</th>
                </tr>
              </thead>
              <tbody>
                {staffChecks.map((check) => (
                  <tr key={check.id}>
                    <td>{check.fullName}</td>
                    <td>
                      <span className={check.helpscoutOk ? styles.tick : styles.dash}>
                        {check.helpscoutOk ? "✓" : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={check.aircallOk ? styles.tick : styles.dash}>
                        {check.aircallOk ? "✓" : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.rowMain}>
                        <span className={check.calendarOk ? styles.tick : styles.cross}>
                          {check.calendarOk ? "✓" : "✗"}
                        </span>
                        <span className={styles.staffWhen}>
                          {check.checkedAt ? `checked ${formatRelative(check.checkedAt)}` : "never checked"}
                        </span>
                        {!check.calendarOk && check.error ? (
                          <span className={styles.staffError}>{check.error}</span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <SettingsSearch />
    </BookingShell>
  );
}
