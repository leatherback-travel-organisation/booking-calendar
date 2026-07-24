import { evaluateEntitlement } from "./evaluator";
import type {
  AccessGrant,
  AccessSnapshot,
  AuditEvent,
  VerifiedIdentity,
} from "./model";

export class AuthenticationRequiredError extends Error {
  readonly code = "authentication_required";

  constructor() {
    super("A verified identity is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class AccessDeniedError extends Error {
  readonly code = "access_denied";
  readonly denialReason: string;

  constructor(denialReason: string) {
    super("Access is denied.");
    this.name = "AccessDeniedError";
    this.denialReason = denialReason;
  }
}

/**
 * Validates the minimum trusted identity contract at the route/action boundary.
 * The caller must supply claims verified by the configured OIDC SDK; raw headers,
 * query parameters and unsigned cookies are never acceptable inputs.
 */
export function requireVerifiedIdentity(
  identity: VerifiedIdentity | null | undefined,
): VerifiedIdentity {
  if (
    !identity ||
    !identity.subject ||
    !identity.issuer ||
    !identity.email ||
    !identity.emailVerified ||
    Number.isNaN(Date.parse(identity.verifiedAt))
  ) {
    throw new AuthenticationRequiredError();
  }
  return identity;
}

/**
 * Rechecks entitlement inside the sensitive API/Server Action. Proxy checks are
 * only an early redirect optimization and are never sufficient authorization.
 */
export function requireEntitlement(input: {
  readonly identity: VerifiedIdentity | null | undefined;
  readonly applicationId: string;
  readonly requiredPermission: string;
  readonly snapshot: AccessSnapshot;
  readonly now?: Date;
}): AccessGrant {
  const identity = requireVerifiedIdentity(input.identity);
  const decision = evaluateEntitlement({
    identity,
    applicationId: input.applicationId,
    requiredPermission: input.requiredPermission,
    snapshot: input.snapshot,
    now: input.now ?? new Date(),
  });
  if (!decision.allowed) throw new AccessDeniedError(decision.reason);
  return decision;
}

export type AuditSink = (event: AuditEvent) => Promise<void>;

/** Denials should be recorded without leaking claims, tokens or raw record data. */
export async function authorizeAndAudit(input: {
  readonly identity: VerifiedIdentity | null | undefined;
  readonly applicationId: string;
  readonly requiredPermission: string;
  readonly snapshot: AccessSnapshot;
  readonly audit: AuditSink;
  readonly eventId: string;
  readonly requestId?: string;
  readonly now?: Date;
}): Promise<AccessGrant> {
  const now = input.now ?? new Date();
  try {
    const grant = requireEntitlement({ ...input, now });
    await input.audit({
      id: input.eventId,
      occurredAt: now.toISOString(),
      action: "entitlement.checked",
      outcome: "success",
      actorUserId: grant.user.id,
      actorIdentitySubject: grant.user.identitySubject,
      applicationId: grant.application.id,
      requestId: input.requestId,
      metadata: { permission: input.requiredPermission },
    });
    return grant;
  } catch (error) {
    await input.audit({
      id: input.eventId,
      occurredAt: now.toISOString(),
      action: "entitlement.checked",
      outcome: "denied",
      actorIdentitySubject: input.identity?.subject,
      applicationId: input.applicationId,
      requestId: input.requestId,
      metadata: {
        permission: input.requiredPermission,
        reason:
          error instanceof AccessDeniedError
            ? error.denialReason
            : error instanceof AuthenticationRequiredError
              ? error.code
            : "authorization_error",
      },
    });
    throw error;
  }
}
