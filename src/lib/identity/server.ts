import "server-only";

import {
  EmployeeDomainError,
  IdentityConfigurationError,
  IdentityRequiredError,
  type VerifiedIdentity
} from "./types";
import { isPreviewIdentityEnabled } from "./mode";
import { workspaceDomainForEmail } from "./workspace-domain";
import { previewAccessSnapshot, previewIdentities } from "@/lib/access/preview-data";

function previewIdentity(): VerifiedIdentity {
  const accessIdentity = previewIdentities.operations;
  const user = previewAccessSnapshot.users.find(
    (candidate) =>
      candidate.identitySubject === accessIdentity.subject &&
      candidate.identityIssuer === accessIdentity.issuer
  );

  return {
    ...accessIdentity,
    displayName: user?.displayName ?? "Cove Preview Admin",
    initials: "CP",
  };
}

function initialsFor(name: string, email: string) {
  const source = name.trim() || email.split("@")[0];
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function getVerifiedIdentity(): Promise<VerifiedIdentity | null> {
  if (isPreviewIdentityEnabled()) return previewIdentity();

  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new IdentityConfigurationError();
  }

  const [{ auth, currentUser }] = await Promise.all([import("@clerk/nextjs/server")]);
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  if (!user) return null;

  const primary =
    user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId) ??
    user.emailAddresses[0];

  if (!primary || primary.verification?.status !== "verified") return null;

  const email = primary.emailAddress.trim().toLowerCase();
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email;

  const issuer =
    typeof sessionClaims?.iss === "string"
      ? sessionClaims.iss
      : process.env.CLERK_ISSUER_URL;
  if (!issuer) throw new IdentityConfigurationError();

  return {
    subject: `clerk:${user.id}`,
    issuer,
    email,
    displayName,
    initials: initialsFor(displayName, email),
    // Clerk verifies the Google identity. Cove's approved-user record, rather
    // than the email domain, decides whether this person belongs to the team.
    population: "employee",
    emailVerified: true,
    verifiedAt: new Date().toISOString(),
    workspaceDomain: workspaceDomainForEmail(email)
  };
}

export async function requireVerifiedIdentity(): Promise<VerifiedIdentity> {
  const identity = await getVerifiedIdentity();
  if (!identity) throw new IdentityRequiredError();
  return identity;
}

export async function requireEmployeeIdentity(): Promise<VerifiedIdentity> {
  const identity = await requireVerifiedIdentity();
  if (identity.population !== "employee") throw new EmployeeDomainError();
  return identity;
}

export function identityMode(): "preview" | "clerk" | "unconfigured" {
  if (isPreviewIdentityEnabled()) return "preview";
  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return "clerk";
  }
  return "unconfigured";
}
