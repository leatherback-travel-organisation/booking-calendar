import {
  COVE_AUTH_VERSION,
  COVE_HEALTH_PROTOCOL,
  assertHttpUrl,
  cleanString,
  normalizeApplicationReference,
  resolveAccessApiUrl,
} from "./core.js";

export function inspectCoveAuthConfiguration({ application, env = process.env } = {}) {
  const checks = [];
  const add = (id, ok, message) => checks.push({ id, status: ok ? "pass" : "fail", message });

  try {
    normalizeApplicationReference(application);
    add("application_reference", true, "Canonical Cove application reference is configured.");
  } catch (error) {
    add("application_reference", false, error instanceof Error ? error.message : "Canonical application reference is missing.");
  }

  const publishableKey = cleanString(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const secretKey = cleanString(env.CLERK_SECRET_KEY);
  const legacyDomain = cleanString(env.NEXT_PUBLIC_CLERK_DOMAIN);
  const legacySatelliteFlag = cleanString(env.NEXT_PUBLIC_CLERK_IS_SATELLITE);
  const primaryUrl = cleanString(env.COVE_PRIMARY_URL) || cleanString(env.NEXT_PUBLIC_COVE_PRIMARY_URL);
  const signInUrl = cleanString(env.NEXT_PUBLIC_CLERK_SIGN_IN_URL);
  add("clerk_publishable_key", Boolean(publishableKey), publishableKey ? "Clerk publishable key is present." : "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.");
  add("clerk_secret_key", Boolean(secretKey), secretKey ? "Clerk server key is present (value withheld)." : "CLERK_SECRET_KEY is missing.");
  add(
    "shared_parent_session",
    !legacyDomain && !legacySatelliteFlag,
    legacyDomain || legacySatelliteFlag
      ? "Remove NEXT_PUBLIC_CLERK_DOMAIN and NEXT_PUBLIC_CLERK_IS_SATELLITE; Leatherback subdomains share Cove's parent-domain session."
      : "No obsolete Clerk satellite configuration is present.",
  );

  addUrlCheck(checks, "cove_primary_url", primaryUrl, "COVE_PRIMARY_URL or NEXT_PUBLIC_COVE_PRIMARY_URL");
  let derivedSignInUrl;
  try {
    derivedSignInUrl = primaryUrl ? new URL("/sign-in", assertHttpUrl(primaryUrl)).toString() : undefined;
  } catch {
    derivedSignInUrl = undefined;
  }
  addUrlCheck(checks, "clerk_sign_in_url", signInUrl || derivedSignInUrl, "NEXT_PUBLIC_CLERK_SIGN_IN_URL");
  try {
    resolveAccessApiUrl(env);
    add("canonical_access_api", true, "Canonical Cove access endpoint is configured.");
  } catch (error) {
    add("canonical_access_api", false, error instanceof Error ? error.message : "Canonical Cove access endpoint is missing.");
  }
  add("parent_domain_session", true, "The kit uses Cove's shared leatherbacktravel.com Clerk session.");
  add("server_entitlement_check", true, "The kit sends the current Clerk token to Cove in an Authorization header for each protected server operation.");

  return checks;
}

export async function collectCoveAuthHealth({ application, env = process.env, fetch: fetchImpl = globalThis.fetch, now = () => new Date(), timeoutMs = 3_000 } = {}) {
  const checks = inspectCoveAuthConfiguration({ application, env });
  let normalizedApplication;
  try {
    normalizedApplication = normalizeApplicationReference(application);
  } catch {
    normalizedApplication = undefined;
  }
  const primaryUrl = cleanString(env.COVE_PRIMARY_URL) || cleanString(env.NEXT_PUBLIC_COVE_PRIMARY_URL);
  const configuredHealthUrl = cleanString(env.COVE_HEALTH_URL);
  let healthUrl = configuredHealthUrl;
  if (!healthUrl && primaryUrl) {
    try {
      healthUrl = new URL("/api/health", assertHttpUrl(primaryUrl)).toString();
    } catch {
      healthUrl = undefined;
    }
  }

  if (healthUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(assertHttpUrl(healthUrl, "COVE_HEALTH_URL"), {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      checks.push({
        id: "cove_reachability",
        status: response.ok ? "pass" : "fail",
        message: response.ok ? "Cove production health endpoint responded successfully." : `Cove health endpoint returned HTTP ${response.status}.`,
      });
    } catch (error) {
      checks.push({ id: "cove_reachability", status: "fail", message: "Cove production health endpoint could not be reached." });
    } finally {
      clearTimeout(timer);
    }
  } else {
    checks.push({ id: "cove_reachability", status: "fail", message: "Cove health URL cannot be derived until the primary URL is configured." });
  }

  const ok = checks.every((check) => check.status === "pass");
  return {
    schema: COVE_HEALTH_PROTOCOL,
    kitVersion: COVE_AUTH_VERSION,
    provider: "cove",
    enforced: true,
    ...(normalizedApplication ? { application: normalizedApplication } : {}),
    ...(cleanString(env.VERCEL_GIT_COMMIT_SHA) ? { deploymentCommitSha: cleanString(env.VERCEL_GIT_COMMIT_SHA) } : {}),
    status: ok ? "ready" : "needs_attention",
    checkedAt: now().toISOString(),
    checks,
  };
}

export function createCoveAuthHealthHandler(options) {
  return async function GET() {
    const evidence = await collectCoveAuthHealth(options);
    return Response.json(evidence, {
      status: evidence.status === "ready" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  };
}

function addUrlCheck(checks, id, value, label) {
  try {
    if (!value) throw new TypeError(`${label} is missing.`);
    assertHttpUrl(value, label);
    checks.push({ id, status: "pass", message: `${label} is configured.` });
  } catch (error) {
    checks.push({ id, status: "fail", message: error instanceof Error ? error.message : `${label} is invalid.` });
  }
}
