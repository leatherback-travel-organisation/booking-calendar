// Manage/invitation tokens: 256-bit bearer credentials. Only the SHA-256
// digest is stored; the raw token appears once, in the guest's email link,
// and is never logged.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type IssuedToken = {
  /** Goes into the emailed link. Never persist or log this. */
  raw: string;
  /** Store this. */
  hash: Buffer;
};

export function issueToken(): IssuedToken {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

/**
 * Derived manage tokens for emails sent AFTER creation (reminders), where the
 * original random token cannot be recovered from its stored hash. Format
 * `r.<bookingId>.<hmac>` — regenerable server-side from the booking id plus a
 * server secret, so nothing sensitive is stored per booking.
 */
export function derivedManageToken(bookingId: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(`manage:${bookingId}`).digest("base64url");
  return `r.${bookingId}.${mac}`;
}

export function parseDerivedManageToken(
  token: string,
  secret: string,
): { bookingId: string } | null {
  if (!token.startsWith("r.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, bookingId, mac] = parts;
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) return null;
  const expected = createHmac("sha256", secret).update(`manage:${bookingId}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { bookingId };
}

export function manageTokenSecret(): string | null {
  return process.env.BOOKING_TOKEN_SECRET ?? process.env.COVE_HANDOFF_SECRET ?? null;
}

/** Constant-time comparison of a presented token against a stored digest. */
export function tokenMatches(raw: string, storedHash: Buffer | Uint8Array): boolean {
  if (typeof raw !== "string" || raw.length < 16 || raw.length > 128) return false;
  const presented = hashToken(raw);
  const stored = Buffer.isBuffer(storedHash) ? storedHash : Buffer.from(storedHash);
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}
