import { z } from "zod";
import type { AccessGrant, AccessSnapshot, ApplicationAccessLevel } from "./model";

const applicationIdentifier = z.string().trim().min(1).max(100);

export const coveAccessRequestSchema = z.object({
  applicationId: z.string().uuid().optional(),
  applicationSlug: applicationIdentifier.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  requiredRole: z.enum(["user", "admin"]).default("user"),
}).superRefine((value, context) => {
  if (Boolean(value.applicationId) === Boolean(value.applicationSlug)) {
    context.addIssue({
      code: "custom",
      message: "Provide exactly one canonical application ID or slug.",
    });
  }
});

export type CoveAccessRequest = z.infer<typeof coveAccessRequestSchema>;

export type CoveAccessGrantResponse = {
  readonly allowed: true;
  readonly application: { readonly id: string; readonly slug: string; readonly name: string };
  readonly user: { readonly id: string };
  readonly role: ApplicationAccessLevel;
  readonly permissions: readonly string[];
  readonly checkedAt: string;
};

export type CoveAccessDenialCode =
  | "authentication_required"
  | "access_denied"
  | "role_required"
  | "invalid_request"
  | "configuration_error"
  | "service_unavailable";

export type CoveAccessDenialResponse = {
  readonly allowed: false;
  readonly code: CoveAccessDenialCode;
  readonly message: string;
};

export function resolveCanonicalApplication(
  snapshot: AccessSnapshot,
  request: CoveAccessRequest,
) {
  return snapshot.applications.find((candidate) =>
    request.applicationId
      ? candidate.id === request.applicationId
      : candidate.slug === request.applicationSlug,
  );
}

export function accessLevelForGrant(
  snapshot: AccessSnapshot,
  grant: AccessGrant,
): ApplicationAccessLevel {
  const grantedLevels = snapshot.roles
    .filter((role) => grant.roleIds.includes(role.id))
    .map((role) => role.level);
  return grantedLevels.includes("admin") ? "admin" : "user";
}

export function grantSatisfiesRequiredRole(
  snapshot: AccessSnapshot,
  grant: AccessGrant,
  requiredRole: ApplicationAccessLevel,
): boolean {
  return requiredRole === "user" || accessLevelForGrant(snapshot, grant) === "admin";
}

export function permissionNamespace(applicationSlug: string): string {
  const normalized = applicationSlug.replaceAll("-", "_");
  return /^[a-z]/.test(normalized) ? normalized : `app_${normalized}`;
}
