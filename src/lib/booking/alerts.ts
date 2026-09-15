// Slack alerting with a database-backed debounce: one message per issue key
// per hour. An alert channel that cries wolf gets muted, and then it may as
// well not exist.

import "server-only";

import { getSql } from "./db";

const DEBOUNCE_SECONDS = 3600;

export async function sendBookingAlert(key: string, message: string): Promise<void> {
  const sql = getSql();
  try {
    const claimed = await sql`
      insert into booking.alert_sent (key, sent_at)
      values (${key}, now())
      on conflict (key) do update set sent_at = now()
      where booking.alert_sent.sent_at < now() - make_interval(secs => ${DEBOUNCE_SECONDS})
      returning key`;
    if (claimed.length === 0) return; // debounced

    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values ('system', 'alert', ${key}, ${JSON.stringify({ message })}::jsonb)`;

    const webhook = process.env.BOOKING_SLACK_WEBHOOK_URL;
    if (!webhook) {
      console.warn(`[booking alert — no webhook configured] ${key}: ${message}`);
      return;
    }
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: *Booking* — ${message}` }),
    });
  } catch (error) {
    // Alerting must never take the booking flow down with it.
    console.error(`[booking alert failed] ${key}`, error);
  }
}
