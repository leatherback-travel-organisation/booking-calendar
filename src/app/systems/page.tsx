import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SystemsManager } from "@/components/systems/systems-manager";
import { getAccessSnapshot } from "@/lib/access/server";
import { getApplicationAccessSummary, listActiveCovePeopleForSystems, requireSystemsOperator } from "@/lib/access/systems-port";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import type { ManagedAsset } from "@/lib/systems/model";
import { getManagedAssets } from "@/lib/systems/server";
import { getCoveSsoIntegrations } from "@/lib/systems/sso-service";
import { getAssetHygiene } from "@/lib/telemetry/hygiene-server";
import { getAssetTelemetry, getGitHubRepositoryInventory } from "@/lib/telemetry/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SuperPanel · Cove",
  description: "Systems-team control for company applications, websites, GitHub, Vercel and hygiene.",
};

export default async function SystemsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [identity, params] = await Promise.all([requireEmployeeIdentity(), searchParams]);
  await requireSystemsOperator(identity);
  const [registeredAssets, people, ssoIntegrations, accessSnapshot] = await Promise.all([
    getManagedAssets(),
    listActiveCovePeopleForSystems(identity),
    getCoveSsoIntegrations(),
    getAccessSnapshot(),
  ]);
  const registeredApplicationIds = new Set(registeredAssets.flatMap((asset) => asset.applicationId ? [asset.applicationId] : []));
  const directoryOnlyAssets: readonly ManagedAsset[] = accessSnapshot.applications
    .filter((application) => !registeredApplicationIds.has(application.id))
    .map((application) => ({
      id: `directory-${application.id}`,
      assetKind: "application",
      applicationId: application.id,
      slug: application.slug,
      name: application.name,
      description: application.description,
      productOwnerName: application.owner,
      memberUserIds: [],
      repository: application.repository,
      productionUrl: application.launchUrl,
      risk: application.risk,
      status: application.status,
      employeeAccessPolicy: application.employeeAccessPolicy ?? "selected",
    }));
  const assets = [...registeredAssets, ...directoryOnlyAssets];
  const applicationIds = assets.flatMap((asset) => asset.applicationId ? [asset.applicationId] : []);
  const [accessSummaries, telemetry, repositoryInventory] = await Promise.all([
    Promise.all(applicationIds.map((applicationId) => getApplicationAccessSummary(identity, applicationId))),
    getAssetTelemetry(assets),
    getGitHubRepositoryInventory(assets),
  ]);
  const hygiene = await getAssetHygiene(assets, telemetry);
  const assetKind = params.view === "websites" ? "website" : "application";

  return (
    <AppShell active="systems" systemsSection={assetKind === "website" ? "websites" : "apps"}>
      <SystemsManager
        assetKind={assetKind}
        assets={assets}
        people={people}
        accessSummaries={accessSummaries}
        telemetry={telemetry}
        repositoryInventory={repositoryInventory}
        hygiene={hygiene}
        ssoIntegrations={ssoIntegrations}
        ssoAutomationEnabled={process.env.COVE_SSO_AUTOMATION_ENABLED === "true"}
      />
    </AppShell>
  );
}
