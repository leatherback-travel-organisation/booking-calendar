"use server";

import { withCoveServerActionAccess } from "@leatherback/cove-auth/server";

const application = { applicationSlug: "replace-with-canonical-slug" } as const;

export const adminAction = withCoveServerActionAccess(application, "admin", async (access, input: string) => {
  return { changedBy: access.user.id, input };
});
