import { withCoveRouteAccess } from "@leatherback/cove-auth/server";

const application = { applicationSlug: "replace-with-canonical-slug" } as const;

export const POST = withCoveRouteAccess(application, "admin", async (request, _context, access) => {
  const input = await request.json();
  return Response.json({ accepted: true, input, changedBy: access.user.id });
});
