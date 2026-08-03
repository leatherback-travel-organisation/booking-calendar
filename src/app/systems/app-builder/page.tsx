import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AppBuilderManager } from "@/components/systems/app-builder-manager";
import { requireSystemsOperator } from "@/lib/access/systems-port";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { listBuilderCodes } from "@/lib/systems/builder-codes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "App Builder · SuperPanel",
  description: "One-time invitation codes for the guided Cove app-building workflow.",
};

export default async function AppBuilderPage() {
  const identity = await requireEmployeeIdentity();
  await requireSystemsOperator(identity);
  const codes = await listBuilderCodes();

  return (
    <AppShell active="systems">
      <AppBuilderManager codes={codes} />
    </AppShell>
  );
}
