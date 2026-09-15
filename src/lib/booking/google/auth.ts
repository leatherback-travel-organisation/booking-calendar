// Domain-wide delegation without the googleapis SDK: sign a service-account
// JWT with node:crypto, exchange it for an access token, impersonating one
// Workspace user per token. The key can act as ANY user in the tenant within
// its two calendar scopes — it lives only in server env and is never logged.

// NOTE: no "server-only" marker here — the pure JWT signer below is unit
// tested under node --test. Nothing in this module runs client-side; the
// secret-bearing entry points are only referenced from server modules.
import { createSign } from "node:crypto";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export class GoogleDelegationError extends Error {
  readonly kind: "not_configured" | "delegation_rejected" | "token_exchange_failed";
  readonly detail?: string;

  constructor(
    message: string,
    kind: "not_configured" | "delegation_rejected" | "token_exchange_failed",
    detail?: string,
  ) {
    super(message);
    this.name = "GoogleDelegationError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function calendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SA_KEY_B64);
}

export function loadServiceAccountKey(): ServiceAccountKey {
  const encoded = process.env.GOOGLE_SA_KEY_B64;
  if (!encoded) {
    throw new GoogleDelegationError("GOOGLE_SA_KEY_B64 is not configured.", "not_configured");
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new GoogleDelegationError("GOOGLE_SA_KEY_B64 is not valid base64-encoded JSON.", "not_configured");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new GoogleDelegationError("Service-account key is missing client_email or private_key.", "not_configured");
  }
  return parsed;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Pure signer, exported for tests. */
export function signServiceAccountJwt(
  key: ServiceAccountKey,
  subjectEmail: string,
  nowSeconds: number,
  scopes: readonly string[] = CALENDAR_SCOPES,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      sub: subjectEmail,
      scope: scopes.join(" "),
      aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

type CachedToken = { accessToken: string; expiresAtMs: number };
const tokenCache = new Map<string, CachedToken>();

/**
 * Access token impersonating `subjectEmail`. Cached until shortly before
 * expiry. A 401 `unauthorized_client` here is a delegation setup problem
 * (client id not authorised, or scope mismatch) — almost never runtime.
 */
export async function accessTokenFor(subjectEmail: string): Promise<string> {
  const cacheKey = subjectEmail.toLowerCase();
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) return cached.accessToken;

  const key = loadServiceAccountKey();
  const assertion = signServiceAccountJwt(key, subjectEmail, Math.floor(Date.now() / 1000));
  const response = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    const kind = body.error === "unauthorized_client" ? "delegation_rejected" : "token_exchange_failed";
    throw new GoogleDelegationError(
      body.error === "unauthorized_client"
        ? `Domain-wide delegation rejected for ${subjectEmail}: check the client id and scopes in the Workspace admin console.`
        : `Google token exchange failed for ${subjectEmail} (${response.status}).`,
      kind,
      body.error_description ?? body.error,
    );
  }
  tokenCache.set(cacheKey, {
    accessToken: body.access_token,
    expiresAtMs: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}
