// Dev-only cron scheduler. Production crons run on Vercel (vercel.json); the
// local demo has no scheduler, so without this the Integrations page slowly
// turns red between manual runs. Hard-gated to the PGlite dev database.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.BOOKING_DEV_PGLITE !== "true" || process.env.NODE_ENV === "production") return;
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  // Deliberately localhost, unlike lib/booking/app-url: this loop only ever
  // runs against the dev server on this machine.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const hit = (path: string) =>
    fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {});

  // Same cadence as production: reminders */5, reference sync */15.
  setInterval(() => void hit("/api/booking/cron/reminders"), 5 * 60_000).unref();
  setInterval(() => void hit("/api/booking/cron/sync-reference-data"), 15 * 60_000).unref();
  console.log("[booking] dev cron scheduler armed (reminders */5, sync */15)");
}
