// Manage/invitation tokens: 256-bit bearer credentials. Only the SHA-256
// digest is stored; the raw token appears once, in the guest's email link,
// and is never logged.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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

/** Constant-time comparison of a presented token against a stored digest. */
export function tokenMatches(raw: string, storedHash: Buffer | Uint8Array): boolean {
  if (typeof raw !== "string" || raw.length < 16 || raw.length > 128) return false;
  const presented = hashToken(raw);
  const stored = Buffer.isBuffer(storedHash) ? storedHash : Buffer.from(storedHash);
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}
