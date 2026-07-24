import { createCoveAuthHealthHandler } from "@leatherback/cove-auth/health";

export const dynamic = "force-dynamic";
export const GET = createCoveAuthHealthHandler({ application: { applicationSlug: "replace-with-canonical-slug" } });
