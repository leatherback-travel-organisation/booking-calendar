import {
  assertAccessApiUrl,
  buildAccessRequestBody,
  parseAccessDecision,
  resolveAccessApiUrl,
} from "./core.js";
import {
  CoveAuthError,
  CoveConfigurationError,
  CoveServiceUnavailableError,
  CoveSignedOutError,
  errorFromAccessDenial,
  isCoveAuthError,
} from "./errors.js";

export async function requireCoveAccess(application, requiredRole = "user", options = {}) {
  let requestBody;
  let accessApiUrl;
  try {
    requestBody = buildAccessRequestBody(application, requiredRole);
    accessApiUrl = options.accessApiUrl
      ? assertAccessApiUrl(options.accessApiUrl)
      : resolveAccessApiUrl(options.env || process.env);
  } catch (error) {
    throw new CoveConfigurationError(error instanceof Error ? error.message : undefined, { cause: error });
  }

  let session;
  try {
    session = await (options.auth || defaultClerkAuth)();
  } catch (error) {
    throw new CoveConfigurationError("Clerk could not read the current server session. Confirm that createCoveProxy() covers this route.", { cause: error });
  }

  if (!session?.userId) throw new CoveSignedOutError();

  let token;
  try {
    token = await session.getToken();
  } catch (error) {
    throw new CoveSignedOutError("Your Cove session could not be refreshed. Sign in again.", { cause: error });
  }
  if (!token) throw new CoveSignedOutError();

  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : 5_000;
  const controller = options.signal ? undefined : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let response;
  try {
    response = await (options.fetch || globalThis.fetch)(accessApiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    throw new CoveServiceUnavailableError(undefined, { cause: error });
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new CoveServiceUnavailableError("Cove returned an unreadable access response.", { cause: error });
  }

  let decision;
  try {
    decision = parseAccessDecision(payload, requestBody.requiredRole);
  } catch (error) {
    throw new CoveServiceUnavailableError(error instanceof Error ? error.message : undefined, { cause: error });
  }

  if (!decision.allowed) throw errorFromAccessDenial(decision);
  if (!response.ok) throw new CoveServiceUnavailableError("Cove returned an inconsistent access response.");
  return decision;
}

export async function resolveCoveAccess(application, requiredRole = "user", options = {}) {
  try {
    return { ok: true, access: await requireCoveAccess(application, requiredRole, options) };
  } catch (error) {
    if (isCoveAuthError(error)) return { ok: false, error };
    throw error;
  }
}

export async function redirectToCoveSignIn(returnBackUrl, options = {}) {
  let session;
  try {
    session = await (options.auth || defaultClerkAuth)();
  } catch (error) {
    throw new CoveConfigurationError("Clerk could not prepare the Cove sign-in redirect.", { cause: error });
  }
  return session.redirectToSignIn({ returnBackUrl });
}

export function coveAccessErrorResponse(error) {
  const coveError = isCoveAuthError(error)
    ? error
    : new CoveServiceUnavailableError("The access check failed safely.", { cause: error });
  return Response.json(coveError.toJSON(), {
    status: coveError.status,
    headers: { "cache-control": "no-store" },
  });
}

export function withCoveRouteAccess(application, requiredRole, handler, options = {}) {
  if (typeof handler !== "function") throw new TypeError("A protected route handler is required.");
  return async function coveProtectedRoute(request, context) {
    try {
      const access = await requireCoveAccess(application, requiredRole, options);
      return await handler(request, context, access);
    } catch (error) {
      return coveAccessErrorResponse(error);
    }
  };
}

export function withCoveServerActionAccess(application, requiredRole, action, options = {}) {
  if (typeof action !== "function") throw new TypeError("A protected server action is required.");
  return async function coveProtectedServerAction(...args) {
    const access = await requireCoveAccess(application, requiredRole, options);
    return action(access, ...args);
  };
}

export {
  CoveAuthError,
  CoveConfigurationError,
  CoveServiceUnavailableError,
  CoveSignedOutError,
  isCoveAuthError,
};
export { CoveUnauthorizedError } from "./errors.js";

async function defaultClerkAuth() {
  const { auth } = await import("@clerk/nextjs/server");
  return auth();
}
