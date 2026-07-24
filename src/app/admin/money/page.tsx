import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { MoneyAdmin } from "@/components/money/money-admin";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getAllMoney } from "@/lib/money/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Money operations · Cove Admin",
  description: "Review invoices, travel credits and reimbursements.",
};

export default async function MoneyAdminPage() {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "money", "money.review");
  const collection = await getAllMoney();

  return <AppShell active="admin" adminSection="money"><MoneyAdmin initialRecords={collection.items} origin={collection.origin} integrityIssues={collection.integrityIssues} /></AppShell>;
}
