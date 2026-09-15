import { AppShell } from "@/components/app-shell";
import { CoveAccessDenied } from "@/components/cove/cove-access-denied";
import { CoveDashboard } from "@/components/cove/cove-dashboard";
import {
  accessibleApplicationsFor,
  CoveAccessDeniedError,
  requireCoveUser,
} from "@/lib/access/server";
import { COVE_CANONICAL_ORIGIN, coveApplicationLaunchUrl } from "@/lib/identity/canonical-origin";
import { isPreviewIdentityEnabled } from "@/lib/identity/mode";
import { requireEmployeeIdentity } from "@/lib/identity/server";

/**
 * In demo/preview mode the production launch handshake cannot succeed, so
 * app cards link directly: in-repo apps by relative path (stays on this
 * origin), external apps by their own URL. Returns null in production, where
 * the ticketed launch flow is the only correct path.
 */
function previewLaunchPath(launchUrl: string): string | null {
  if (!isPreviewIdentityEnabled()) return null;
  try {
    const url = new URL(launchUrl);
    if (url.origin === COVE_CANONICAL_ORIGIN && url.pathname !== "/") {
      return url.pathname + url.search;
    }
    return launchUrl;
  } catch {
    return null;
  }
}

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
          // Demo/preview mode: the production launch handshake cannot succeed
          // (the app may not exist in production yet), so in-repo apps link
          // straight to their local path instead of bouncing to production.
          href: previewLaunchPath(application.launchUrl) ?? coveApplicationLaunchUrl(application.slug),
          slug: application.slug,
          owner: application.owner,
        }))}
      />
    </AppShell>
  );
}
