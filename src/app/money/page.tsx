import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { MoneyWorkspace } from "@/components/money/money-workspace";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getEmployeeMoney } from "@/lib/money/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Money · Cove",
  description: "Track invoices, travel credits and reimbursements.",
};

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ new?: string; view?: string }> }) {
  const identity = await requireEmployeeIdentity();
  const access = await requireApplicationPermission(identity, "money", "money.read_own");
  const params = await searchParams;
  const [collection, canManage] = await Promise.all([
    getEmployeeMoney(identity.email),
    Promise.resolve(access.permissions.includes("money.review")),
  ]);

  return (
    <AppShell active="money">
      <MoneyWorkspace
        initialRecords={collection.items}
        origin={collection.origin}
        integrityIssues={collection.integrityIssues}
        displayName={identity.displayName}
        canManage={canManage}
        initialView={params.view ?? params.new}
      />
    </AppShell>
  );
}
