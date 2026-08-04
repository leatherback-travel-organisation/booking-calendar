type ClerkUser = {
  readonly id: string;
};

type ClerkUserList = {
  readonly data: readonly ClerkUser[];
};

export type ClerkProvisioningClient = {
  readonly users: {
    getUserList(input: {
      emailAddress: string[];
      limit: number;
    }): Promise<ClerkUserList>;
    createUser(input: {
      emailAddress: string[];
      firstName?: string;
      lastName?: string;
      skipPasswordRequirement: boolean;
    }): Promise<ClerkUser>;
  };
};

function personName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

async function findClerkUser(
  client: ClerkProvisioningClient,
  email: string,
): Promise<ClerkUser | null> {
  const result = await client.users.getUserList({
    emailAddress: [email],
    limit: 2,
  });
  return result.data[0] ?? null;
}

/**
 * Provision the Clerk identity before writing Cove access. If the database
 * write later fails, the new identity still has no Cove entitlement and
 * therefore remains safely denied.
 */
export async function ensureClerkTeamUser(
  client: ClerkProvisioningClient,
  input: { readonly name: string; readonly email: string },
) {
  const email = input.email.trim().toLowerCase();
  const existing = await findClerkUser(client, email);
  if (existing) return { userId: existing.id, created: false };

  const { firstName, lastName } = personName(input.name);
  try {
    const user = await client.users.createUser({
      emailAddress: [email],
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      skipPasswordRequirement: true,
    });
    return { userId: user.id, created: true };
  } catch (cause) {
    // A simultaneous invite can win the create race. Re-read before failing.
    const racedUser = await findClerkUser(client, email);
    if (racedUser) return { userId: racedUser.id, created: false };
    throw cause;
  }
}
