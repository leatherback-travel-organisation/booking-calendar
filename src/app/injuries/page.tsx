import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { InjuryWorkspace } from "@/components/injuries/injury-workspace";
import { requireApplicationPermission } from "@/lib/access/server";
import { getEmployeeInjuries } from "@/lib/injuries/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mental health & injury register · Cove",
  description: "Privately review health reports and submit workplace injury reports.",
};

export default async function InjuriesPage() {
  const identity = await requireEmployeeIdentity();
  const access = await requireApplicationPermission(identity, "injuries", "injuries.read_own");
  const collection = await getEmployeeInjuries(identity);
  return (
    <AppShell active="home">
      <InjuryWorkspace initialRecords={collection.items} origin={collection.origin} employeeMatched={collection.employeeMatched} integrityIssues={collection.integrityIssues} displayName={identity.displayName} canManage={access.permissions.includes("injuries.read_all")} />
    </AppShell>
  );
}
