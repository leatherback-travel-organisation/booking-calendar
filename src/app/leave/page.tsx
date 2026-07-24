import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leave · Cove",
  description: "Leatherback leave and time-off services.",
};

export default async function LeavePage() {
  const identity = await requireEmployeeIdentity();
  await requireCoveUser(identity);

  return (
    <AppShell active="home">
      <div className="people-page">
        <header className="workspace-page-header">
          <div><span className="section-kicker">Employee service</span><h1>Leave</h1><p>Time-off requests and balances will live here.</p></div>
        </header>
        <section className="portal-data-panel service-integration-state">
          <span className="source-pill source-unavailable">Integration pending</span>
          <h2>Leave records are not connected yet</h2>
          <p>Cove will not invent a balance or accept a request until the approved leave system and workflow are connected.</p>
        </section>
      </div>
    </AppShell>
  );
}
