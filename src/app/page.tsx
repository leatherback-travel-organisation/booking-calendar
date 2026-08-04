import { AppShell } from "@/components/app-shell";
import { CoveAccessDenied } from "@/components/cove/cove-access-denied";
import { CoveDashboard } from "@/components/cove/cove-dashboard";
import {
  accessibleApplicationsFor,
  CoveAccessDeniedError,
  requireCoveUser,
} from "@/lib/access/server";
import { coveApplicationLaunchUrl } from "@/lib/identity/canonical-origin";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const identity = await requireEmployeeIdentity();
  try {
    await requireCoveUser(identity);
  } catch (error) {
    if (error instanceof CoveAccessDeniedError) return <CoveAccessDenied />;
    throw error;
  }
  const applications = await accessibleApplicationsFor(identity);
  const firstName = identity.displayName.split(/\s+/)[0] || identity.displayName;

  return (
    <AppShell active="home">
      <CoveDashboard
        firstName={firstName}
        applications={applications.map((application) => ({
          id: application.id,
          name: application.name,
          description: application.description,
          href: coveApplicationLaunchUrl(application.slug),
          slug: application.slug,
          owner: application.owner,
        }))}
      />
    </AppShell>
  );
}
