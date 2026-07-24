import type { AuditEvent } from "./model.ts";

export type AuditFeedEvent = AuditEvent & {
  readonly actorName: string;
  readonly applicationName?: string;
};

export type AuditFeed = {
  readonly events: readonly AuditFeedEvent[];
  readonly source: "postgres" | "demo" | "unavailable";
  readonly message?: string;
};

export type AuditRow = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const METADATA_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const FORBIDDEN_METADATA_KEY = /(authorization|cookie|credential|password|secret|session|token|api_?key|raw|pii)/i;
const outcomes = new Set<AuditEvent["outcome"]>(["success", "denied", "error"]);
const targetTypes = new Set<NonNullable<AuditEvent["targetType"]>>([
  "user",
  "team",
  "application",
  "entitlement",
  "session",
]);

function text(value: unknown, field: string, maxLength = 200): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Audit event field ${field} is invalid.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maxLength = 200): string | undefined {
  if (value == null || value === "") return undefined;
  return text(value, field, maxLength);
}

function id(value: unknown, field: string): string {
  const result = text(value, field, 36);
  if (!UUID.test(result)) throw new Error(`Audit event field ${field} is not a UUID.`);
  return result;
}

function optionalId(value: unknown, field: string): string | undefined {
  if (value == null || value === "") return undefined;
  return id(value, field);
}

function timestamp(value: unknown): string {
  const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.valueOf())) {
    throw new Error("Audit event timestamp is invalid.");
  }
  return parsed.toISOString();
}

function metadata(value: unknown): Readonly<Record<string, string | number | boolean | null>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Audit event metadata is not an object.");
  }
  const entries = Object.entries(value);
  if (entries.length > 12) throw new Error("Audit event metadata contains too many fields.");

  return Object.fromEntries(entries.map(([key, item]) => {
    if (!METADATA_KEY.test(key) || FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error("Audit event metadata contains a forbidden field.");
    }
    if (typeof item === "string") return [key, text(item, `metadata.${key}`, 160)];
    if (typeof item === "number" && Number.isFinite(item)) return [key, item];
    if (typeof item === "boolean" || item === null) return [key, item];
    throw new Error(`Audit event metadata field ${key} is invalid.`);
  }));
}

export function parseAuditRows(rows: readonly AuditRow[]): readonly AuditFeedEvent[] {
  const events = rows.map((row): AuditFeedEvent => {
    const action = text(row.action, "action", 120);
    const outcome = text(row.outcome, "outcome", 16);
    if (!ACTION.test(action)) throw new Error("Audit event action is invalid.");
    if (!outcomes.has(outcome as AuditEvent["outcome"])) throw new Error("Audit event outcome is invalid.");

    const actorUserId = optionalId(row.actor_user_id, "actor_user_id");
    const actorIdentitySubject = optionalText(row.actor_identity_subject, "actor_identity_subject", 200);
    const actorName = actorUserId
      ? text(row.actor_name, "actor_name", 120)
      : actorIdentitySubject
        ? "Verified identity"
        : "System";
    const applicationId = optionalId(row.application_id, "application_id");
    const applicationName = applicationId
      ? text(row.application_name, "application_name", 120)
      : undefined;
    const targetType = optionalText(row.target_type, "target_type", 24);
    const targetId = optionalText(row.target_id, "target_id", 200);
    if (Boolean(targetType) !== Boolean(targetId)) {
      throw new Error("Audit event target fields are incomplete.");
    }
    if (targetType && !targetTypes.has(targetType as NonNullable<AuditEvent["targetType"]>)) {
      throw new Error("Audit event target type is invalid.");
    }

    return {
      id: id(row.id, "id"),
      occurredAt: timestamp(row.occurred_at),
      action,
      outcome: outcome as AuditEvent["outcome"],
      actorUserId,
      actorIdentitySubject,
      actorName,
      applicationId,
      applicationName,
      targetType: targetType as AuditEvent["targetType"] | undefined,
      targetId,
      requestId: optionalText(row.request_id, "request_id", 200),
      metadata: metadata(row.metadata),
    };
  });

  if (new Set(events.map((event) => event.id)).size !== events.length) {
    throw new Error("Audit feed contains duplicate event IDs.");
  }
  return [...events].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}
