import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function tokensEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  const leftHash = Buffer.from(tokenHash(left), "hex");
  const rightHash = Buffer.from(tokenHash(right), "hex");
  return timingSafeEqual(leftHash, rightHash);
}
