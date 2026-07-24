import type {
  IdentityPopulation,
  VerifiedIdentity as AccessVerifiedIdentity
} from "@/lib/access/model";

export type VerifiedIdentity = AccessVerifiedIdentity & {
  readonly displayName: string;
  readonly initials: string;
};

export type { IdentityPopulation };

export class IdentityRequiredError extends Error {
  constructor() {
    super("A verified identity is required.");
    this.name = "IdentityRequiredError";
  }
}

export class IdentityConfigurationError extends Error {
  constructor() {
    super("The identity provider is not configured.");
    this.name = "IdentityConfigurationError";
  }
}

export class EmployeeDomainError extends Error {
  constructor() {
    super("This area is restricted to Leatherback Travel employees.");
    this.name = "EmployeeDomainError";
  }
}
