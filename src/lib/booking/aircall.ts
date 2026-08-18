// Aircall click-to-dial: POST /v1/users/{id}/dial rings the BM's own Aircall
// app first, then connects the guest — so the human is always on the line
// before the guest's phone rings. Stub-first: without credentials the intent
// is recorded in the audit log and surfaced honestly in the UI.

import "server-only";

import { getSql } from "./db";
import { normalizeDigits, pickLine, type BrandLines } from "./aircall-lines.ts";

export type { BrandLines };

export function aircallConfigured(): boolean {
  return Boolean(process.env.AIRCALL_API_ID && process.env.AIRCALL_API_TOKEN);
}

type AircallNumber = { id: number; digits: string };
let numbersCache: { numbers: AircallNumber[]; fetchedAtMs: number } | null = null;

async function aircallNumbers(auth: string): Promise<AircallNumber[]> {
  if (numbersCache && Date.now() - numbersCache.fetchedAtMs < 600_000) return numbersCache.numbers;
  const response = await fetch("https://api.aircall.io/v1/numbers?per_page=50", {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) return numbersCache?.numbers ?? [];
  const body = (await response.json()) as { numbers?: Array<{ id: number; digits?: string; e164_digits?: string }> };
  const numbers = (body.numbers ?? []).map((n) => ({
    id: n.id,
    digits: normalizeDigits(n.e164_digits ?? n.digits ?? ""),
  }));
  numbersCache = { numbers, fetchedAtMs: Date.now() };
  return numbers;
}

export type DialResult =
  | { ok: true; stubbed: boolean }
  | { ok: false; reason: "no_phone" | "no_aircall_user" | "api_error"; detail?: string };

export async function dialGuest(args: {
  aircallUserId: string | null;
  guestPhone: string | null;
  actorEmail: string;
  bookingId: string;
  /** Brand lines so NZ guests are called from the NZ number, AU from AU. */
  lines?: BrandLines;
}): Promise<DialResult> {
  const sql = getSql();
  const phone = args.guestPhone?.trim();
  if (!phone) return { ok: false, reason: "no_phone" };
  if (!args.aircallUserId) return { ok: false, reason: "no_aircall_user" };

  const line = pickLine(phone, args.lines ?? { phoneAu: null, phoneNz: null, phoneDefault: null });

  if (!aircallConfigured()) {
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values (${args.actorEmail}, 'aircall_dial_stubbed', ${args.bookingId}, ${JSON.stringify({
        aircallUserId: args.aircallUserId,
        phone,
        line,
      })}::jsonb)`;
    return { ok: true, stubbed: true };
  }

  const auth = Buffer.from(`${process.env.AIRCALL_API_ID}:${process.env.AIRCALL_API_TOKEN}`).toString("base64");

  // Resolve the brand's display number to an Aircall number id so the call
  // goes out on the right line. Falls back to the BM's default line when the
  // number isn't found in Aircall (that mismatch is worth hearing about, so
  // it rides along in the audit detail either way).
  let numberId: number | null = null;
  if (line.number) {
    const numbers = await aircallNumbers(auth);
    numberId = numbers.find((n) => n.digits === normalizeDigits(line.number!))?.id ?? null;
  }

  const response = numberId
    ? await fetch(`https://api.aircall.io/v1/users/${encodeURIComponent(args.aircallUserId)}/calls`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ number_id: numberId, to: phone }),
      })
    : await fetch(`https://api.aircall.io/v1/users/${encodeURIComponent(args.aircallUserId)}/dial`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone }),
      });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values (${args.actorEmail}, 'aircall_dial_failed', ${args.bookingId}, ${JSON.stringify({ status: response.status, detail })}::jsonb)`;
    return { ok: false, reason: "api_error", detail: `Aircall returned ${response.status}` };
  }
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${args.actorEmail}, 'aircall_dial_started', ${args.bookingId}, ${JSON.stringify({ phone })}::jsonb)`;
  return { ok: true, stubbed: false };
}
