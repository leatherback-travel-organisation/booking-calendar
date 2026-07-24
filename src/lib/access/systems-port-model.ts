import { z } from "zod";
import type { AccessSnapshot, ApplicationAccessLevel } from "./model";

export {
  SUPERPANEL_ADMIN_ROLE_ID,
  SUPERPANEL_APPLICATION_ID,
  SUPERPANEL_APPLICATION_SLUG,
  SUPERPANEL_USER_ROLE_ID,
  superPanelAccessLevelForPlatformRoles,
} from "./application-ids.ts";

type Row = Readonly<Record<string, unknown>>;

const uuid = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type SystemsOperator = {
  readonly userId: string;
  readonly displayName: string;
  readonly verifiedEmail: string;
};

export type ActiveCovePerson = SystemsOperator & {
  readonly status: "active" | "invited";
  readonly identityVerified: boolean;
};

export type ProvisionApplicationInput = {
  readonly requestId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly launchUrl: string;
  readonly ownerUserId: string;
  readonly memberUserIds: readonly string[];
  readonly employeeAccessPolicy: "selected" | "all";
};

export type ProvisionedApplication = {
  readonly applicationId: string;
  readonly slug: string;
};

export type AuthorizedProvisionApplicationCommand = ProvisionApplicationInput & {
  readonly actorUserId: string;
};

export type AtomicApplicationProvisioner<Result extends ProvisionedApplication = ProvisionedApplication> = (
  command: AuthorizedProvisionApplicationCommand,
) => Promise<Result>;

export type ApplicationAccessSummaryUser = {
  readonly userId: string;
  readonly displayName: string;
  readonly verifiedEmail: string;
  readonly level: ApplicationAccessLevel;
};

export type ApplicationAccessSummary = {
  readonly applicationId: string;
  readonly users: readonly ApplicationAccessSummaryUser[];
  readonly userCount: number;
  readonly adminCount: number;
};

const provisionApplicationSchema = z.object({
  requestId: uuid,
  slug,
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(500),
  launchUrl: z.string().trim().max(2_048),
  ownerUserId: uuid,
  memberUserIds: z.array(uuid).max(50),
  employeeAccessPolicy: z.enum(["selected", "all"]).default("selected"),
});

function credentialFreeHttpsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Use a valid HTTPS application URL.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Use a credential-free HTTPS application URL.");
  }
  url.hash = "";
  return url.toString();
}

export function parseProvisionApplicationInput(input: unknown): ProvisionApplicationInput {
  const parsed = provisionApplicationSchema.parse(input);
  return {
    ...parsed,
    launchUrl: credentialFreeHttpsUrl(parsed.launchUrl),
    memberUserIds: parsed.employeeAccessPolicy === "all"
      ? []
      : [...new Set(parsed.memberUserIds)].filter((userId) => userId !== parsed.ownerUserId),
  };
}

function requiredString(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Systems access field ${field} is invalid.`);
  }
  return value.trim();
}

export function parseActiveCovePeopleRows(rows: readonly Row[]): readonly ActiveCovePerson[] {
  const people = rows.map((row) => {
    const status = z.enum(["active", "invited"]).parse(requiredString(row, "directory_status"));
    const identityVerified = row.identity_verified === true || row.identity_verified === "true";
    if ((status === "active") !== identityVerified) {
      throw new Error("The Systems people directory contains inconsistent identity status.");
    }
    return {
      userId: uuid.parse(requiredString(row, "user_id")),
      displayName: requiredString(row, "display_name"),
      verifiedEmail: z.string().email().parse(requiredString(row, "verified_email").toLowerCase()),
      status,
      identityVerified,
    };
  });
  if (new Set(people.map((person) => person.userId)).size !== people.length) {
    throw new Error("The active Cove people directory contains duplicate user IDs.");
  }
  return people;
}

function isActiveWindow(
  item: { startsAt?: string; expiresAt?: string; revokedAt?: string },
  now: Date,
): boolean {
  if (item.revokedAt) return false;
  const startsAt = item.startsAt ? Date.parse(item.startsAt) : undefined;
  const expiresAt = item.expiresAt ? Date.parse(item.expiresAt) : undefined;
  if (startsAt !== undefined && (Number.isNaN(startsAt) || startsAt > now.getTime())) return false;
  if (expiresAt !== undefined && (Number.isNaN(expiresAt) || expiresAt <= now.getTime())) return false;
  return true;
}

export function buildApplicationAccessSummary(
  snapshot: AccessSnapshot,
  applicationId: string,
  now: Date,
): ApplicationAccessSummary {
  if (Number.isNaN(now.getTime())) throw new Error("The access-summary time is invalid.");
  if (!snapshot.applications.some((application) => application.id === applicationId)) {
    throw new Error("The requested application is not registered.");
  }

  const activeTeamIds = new Set(snapshot.teams.filter((team) => team.status === "active").map((team) => team.id));
  const roleLevels = new Map(
    snapshot.roles
      .filter((role) => role.applicationId === applicationId && role.allowedPopulations.includes("employee"))
      .map((role) => [role.id, role.level] as const),
  );
  const applicationEntitlements = snapshot.entitlements.filter(
    (entitlement) => entitlement.applicationId === applicationId && roleLevels.has(entitlement.roleId) && isActiveWindow(entitlement, now),
  );

  const users = snapshot.users
    .filter((user) => user.population === "employee" && user.status === "active")
    .flatMap((user): ApplicationAccessSummaryUser[] => {
      const userTeamIds = new Set(
        snapshot.teamMemberships
          .filter(
            (membership) =>
              membership.userId === user.id &&
              activeTeamIds.has(membership.teamId) &&
              isActiveWindow(membership, now),
          )
          .map((membership) => membership.teamId),
      );
      const levels = applicationEntitlements.flatMap((entitlement) => {
        const applies = entitlement.subject.type === "user"
          ? entitlement.subject.userId === user.id
          : userTeamIds.has(entitlement.subject.teamId);
        const level = roleLevels.get(entitlement.roleId);
        return applies && level ? [level] : [];
      });
      if (levels.length === 0) return [];
      return [{
        userId: user.id,
        displayName: user.displayName,
        verifiedEmail: user.email,
        level: levels.includes("admin") ? "admin" : "user",
      }];
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.verifiedEmail.localeCompare(b.verifiedEmail));

  return {
    applicationId,
    users,
    userCount: users.filter((user) => user.level === "user").length,
    adminCount: users.filter((user) => user.level === "admin").length,
  };
}
