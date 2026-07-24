import { CoveAccessState } from "@leatherback/cove-auth/components";
import { resolveCoveAccess } from "@leatherback/cove-auth/server";

const application = { applicationSlug: "replace-with-canonical-slug" } as const;

export default async function ProtectedPage() {
  const result = await resolveCoveAccess(application, "user");
  if (!result.ok) return <CoveAccessState kind={result.error.kind} message={result.error.message} retryUrl="/" />;
  return <main>Protected content for {result.access.application.name}</main>;
}
