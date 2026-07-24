import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AgenticOsWorkspace } from "@/components/control-room/control-room";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agentic OS · Cove",
  description: "Voice-first delegation, agent capabilities and human approval for Leatherback Travel.",
};

export default async function AgenticOsPage() {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "agentic-os", "agentic_os.read");

  return (
    <AppShell active="agentic-os">
      <AgenticOsWorkspace operatorName={identity.displayName} />
    </AppShell>
  );
}
