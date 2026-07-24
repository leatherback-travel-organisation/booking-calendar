import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const COVE_HANDOFF_VERSION = 1;
export const COVE_HANDOFF_TTL_SECONDS = 60;
export const COVE_HANDOFF_CLOCK_WINDOW_SECONDS = 90;
export const COVE_HANDOFF_VERIFICATION_SCHEMA =
  "leatherback.cove-handoff-verification/v1";

const applicationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CoveHandoffClaims = {
  readonly v: typeof COVE_HANDOFF_VERSION;
  readonly applicationSlug: string;
  readonly userId: string;
  readonly email: string;
  readonly population: string;
  readonly exp: number;
  readonly nonce: string;
};

type CreateTicketInput = Omit<CoveHandoffClaims, "v" | "exp" | "nonce"> & {
  readonly nowSeconds?: number;
  readonly nonce?: string;
};

function configuredSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createCoveHandoffTicket(
  input: CreateTicketInput,
  secret: string | undefined,
): string {
  if (!configuredSecret(secret)) {
    throw new Error("Cove application handoff is not configured.");
  }
  if (
    !applicationSlugPattern.test(input.applicationSlug) ||
    !isBoundedString(input.userId, 256) ||
    !isBoundedString(input.email, 320) ||
    !isBoundedString(input.population, 100)
  ) {
    throw new Error("Cove handoff claims are invalid.");
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const nonce = input.nonce ?? randomUUID();
  if (!Number.isInteger(nowSeconds) || !uuidPattern.test(nonce)) {
    throw new Error("Cove handoff timing claims are invalid.");
  }

  const claims: CoveHandoffClaims = {
    v: COVE_HANDOFF_VERSION,
    applicationSlug: input.applicationSlug,
    userId: input.userId,
    email: input.email,
    population: input.population,
    exp: nowSeconds + COVE_HANDOFF_TTL_SECONDS,
    nonce,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signPayload(payload, secret)}`;
}

export function verifyCoveHandoffTicket(input: {
  readonly ticket: unknown;
  readonly applicationSlug: unknown;
  readonly secret: string | undefined;
  readonly nowSeconds?: number;
}): CoveHandoffClaims | null {
  if (
    !configuredSecret(input.secret) ||
    !isBoundedString(input.ticket, 4_096) ||
    !isBoundedString(input.applicationSlug, 100) ||
    !applicationSlugPattern.test(input.applicationSlug)
  ) {
    return null;
  }

  const segments = input.ticket.split(".");
  if (segments.length !== 2) return null;
  const [payload, suppliedSignature] = segments;
  if (
    !payload ||
    !suppliedSignature ||
    !base64UrlPattern.test(payload) ||
    !base64UrlPattern.test(suppliedSignature)
  ) {
    return null;
  }

  const expectedSignature = Buffer.from(
    signPayload(payload, input.secret),
    "base64url",
  );
  const actualSignature = Buffer.from(suppliedSignature, "base64url");
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const candidate: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!isRecord(candidate)) return null;

    const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
    if (
      candidate.v !== COVE_HANDOFF_VERSION ||
      candidate.applicationSlug !== input.applicationSlug ||
      !isBoundedString(candidate.userId, 256) ||
      !isBoundedString(candidate.email, 320) ||
      !isBoundedString(candidate.population, 100) ||
      typeof candidate.exp !== "number" ||
      !Number.isInteger(candidate.exp) ||
      candidate.exp < nowSeconds ||
      candidate.exp > nowSeconds + COVE_HANDOFF_CLOCK_WINDOW_SECONDS ||
      !isBoundedString(candidate.nonce, 64) ||
      !uuidPattern.test(candidate.nonce)
    ) {
      return null;
    }

    return candidate as CoveHandoffClaims;
  } catch {
    return null;
  }
}
