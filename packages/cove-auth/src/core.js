export const COVE_AUTH_VERSION = "1.1.0";
export const COVE_ACCESS_PROTOCOL = "leatherback.cove-access/v1";
export const COVE_HEALTH_PROTOCOL = "leatherback.cove-auth.health/v1";
export const COVE_ROLES = Object.freeze(["user", "admin"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRole(role = "user") {
  if (typeof role !== "string") throw new TypeError("Cove role must be 'user' or 'admin'.");
  const normalized = role.trim().toLowerCase();
  if (!COVE_ROLES.includes(normalized)) throw new TypeError("Cove role must be 'user' or 'admin'.");
  return normalized;
}

export function applicationById(applicationId) {
  return normalizeApplicationReference({ applicationId });
}

export function applicationBySlug(applicationSlug) {
  return normalizeApplicationReference({ applicationSlug });
}

export function normalizeApplicationReference(reference) {
  if (typeof reference === "string") {
    const value = reference.trim();
    if (!value) throw new TypeError("A Cove application ID or canonical slug is required.");
    return UUID.test(value)
      ? { applicationId: value }
      : { applicationSlug: value };
  }

  if (!reference || typeof reference !== "object") {
    throw new TypeError("A Cove application ID or canonical slug is required.");
  }

  const applicationId = typeof reference.applicationId === "string" ? reference.applicationId.trim() : "";
  const applicationSlug = typeof reference.applicationSlug === "string"
    ? reference.applicationSlug.trim()
    : typeof reference.slug === "string"
      ? reference.slug.trim()
      : "";

  if (Boolean(applicationId) === Boolean(applicationSlug)) {
    throw new TypeError("Provide exactly one Cove applicationId or applicationSlug.");
  }

  return applicationId ? { applicationId } : { applicationSlug };
}

export function roleSatisfies(actualRole, requiredRole) {
  const actual = normalizeRole(actualRole);
  const required = normalizeRole(requiredRole);
  return actual === "admin" || required === "user";
}

export function buildAccessRequestBody(application, requiredRole = "user") {
  return {
    ...normalizeApplicationReference(application),
    requiredRole: normalizeRole(requiredRole),
  };
}

export function resolveAccessApiUrl(env = process.env) {
  const override = cleanString(env.COVE_ACCESS_API_URL);
  if (override) return assertAccessApiUrl(override, "COVE_ACCESS_API_URL");

  const primary = cleanString(env.COVE_PRIMARY_URL) || cleanString(env.NEXT_PUBLIC_COVE_PRIMARY_URL);
  if (!primary) {
    throw new TypeError("Set COVE_ACCESS_API_URL or COVE_PRIMARY_URL for canonical Cove access checks.");
  }

  return assertAccessApiUrl(new URL("/api/cove/access", assertHttpUrl(primary, "COVE_PRIMARY_URL")).toString(), "Cove access API URL");
}

export function assertAccessApiUrl(value, label = "Cove access API URL") {
  const parsed = new URL(assertHttpUrl(value, label));
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError(`${label} must not contain credentials, a query string, or a fragment.`);
  }
  return parsed.toString();
}

export function parseAccessDecision(payload, requiredRole = "user") {
  if (!payload || typeof payload !== "object" || typeof payload.allowed !== "boolean") {
    throw new TypeError("Cove returned an invalid access decision.");
  }

  if (!payload.allowed) {
    if (typeof payload.code !== "string" || typeof payload.message !== "string") {
      throw new TypeError("Cove returned an invalid access denial.");
    }
    return { allowed: false, code: payload.code, message: payload.message };
  }

  const role = normalizeRole(payload.role);
  if (!roleSatisfies(role, requiredRole)) {
    return {
      allowed: false,
      code: "role_required",
      message: `This action requires Cove ${normalizeRole(requiredRole)} access.`,
    };
  }

  if (!isRecordWithString(payload.application, "id") ||
      typeof payload.application.slug !== "string" ||
      typeof payload.application.name !== "string" ||
      !isRecordWithString(payload.user, "id") ||
      !Array.isArray(payload.permissions) ||
      !payload.permissions.every((permission) => typeof permission === "string") ||
      typeof payload.checkedAt !== "string") {
    throw new TypeError("Cove returned an incomplete access grant.");
  }

  return {
    allowed: true,
    application: {
      id: payload.application.id,
      slug: payload.application.slug,
      name: payload.application.name,
    },
    user: { id: payload.user.id },
    role,
    permissions: [...payload.permissions],
    checkedAt: payload.checkedAt,
  };
}

export function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function assertHttpUrl(value, label = "URL") {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
  return parsed.toString();
}

function isRecordWithString(value, property) {
  return Boolean(value && typeof value === "object" && typeof value[property] === "string" && value[property].trim());
}
