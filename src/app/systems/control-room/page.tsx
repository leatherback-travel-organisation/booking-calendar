import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SystemsControlRoom } from "@/components/control-room/control-room";
import { requireSystemsOperator } from "@/lib/access/systems-port";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Systems Control Room · SuperPanel",
  description: "Application session evidence, backup coverage and safe restore drills.",
};

export default async function ControlRoomPage() {
  const identity = await requireEmployeeIdentity();
  await requireSystemsOperator(identity);

  return (
    <AppShell active="systems">
      <SystemsControlRoom />
    </AppShell>
  );
}
