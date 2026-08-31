import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { GardenWorkspace } from "@/components/garden/garden-workspace";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getGardenWorkspace } from "@/lib/garden/server.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Garden · Cove",
  description: "A company-wide view of Gardening projects across Leatherback.",
};

export default async function GardenPage() {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.read");
  const workspace = await getGardenWorkspace(identity);
  return (
    <AppShell active="garden">
      <GardenWorkspace workspace={workspace} />
    </AppShell>
  );
}
