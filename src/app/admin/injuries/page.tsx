import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { InjuryAdmin } from "@/components/injuries/injury-admin";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getAllInjuries } from "@/lib/injuries/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mental health & injury register · Cove Admin",
  description: "Review mental-health and physical-injury reports across the team.",
};

export default async function InjuryAdminPage() {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "injuries", "injuries.read_all");
  const collection = await getAllInjuries();

  return (
    <AppShell active="admin" adminSection="injuries">
      <InjuryAdmin initialRecords={collection.items} origin={collection.origin} integrityIssues={collection.integrityIssues} />
    </AppShell>
  );
}
