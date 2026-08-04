import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AppBuilderComingSoon } from "@/components/app-builder/app-builder-coming-soon";
import { accessLevelForGrant } from "@/lib/access/cove-service-contract";
import { getAccessSnapshot, requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { appBuilderEngineConfigured, listAllAppBuilderRequests, listAppBuilderRequests, listAppBuilderTargets } from "@/lib/app-builder/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "App Builder · Cove",
  description: "A controlled way for Leatherback teams to improve Cove apps with AI.",
};

export default async function AppBuilderPage() {
  const identity = await requireEmployeeIdentity();
  const appBuilderAccess = await requireApplicationPermission(identity, "app-builder", "app_builder.read");
  const user = await requireCoveUser(identity);
  const targets = await listAppBuilderTargets(user);
  const requests = await listAppBuilderRequests(targets.map((target) => target.id));
  const snapshot = await getAccessSnapshot();
  const isAppBuilderAdmin = accessLevelForGrant(snapshot, appBuilderAccess) === "admin";
  const allRequests = isAppBuilderAdmin ? await listAllAppBuilderRequests() : undefined;

  return (
    <AppShell active="app-builder">
      <AppBuilderComingSoon targets={targets} requests={requests} allRequests={allRequests} engineReady={appBuilderEngineConfigured()} />
    </AppShell>
  );
}
