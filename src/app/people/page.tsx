import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PeopleDirectory } from "@/components/people/people-directory";
import { getDirectory } from "@/lib/airtable/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { requireCoveUser } from "@/lib/access/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People · Cove",
  description: "Find your Leatherback Travel teammates.",
};

export default async function PeoplePage() {
  const identity = await requireEmployeeIdentity();
  await requireCoveUser(identity);
  const collection = await getDirectory();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell active="people">
      <div className="people-page">
        <header className="workspace-page-header">
          <div><span className="section-kicker">Workspace</span><h1>People</h1><p>Find teammates across every brand and team.</p></div>
          <div className="workspace-page-stat"><strong>{collection.items.length}</strong><span>current team members</span></div>
        </header>
        <section className="portal-data-panel">
          <div className="portal-data-heading"><div><span className={`source-pill source-${collection.origin}`}>{collection.origin === "airtable" ? "Live from Airtable" : collection.origin === "preview" ? "Demonstration data" : "Directory unavailable"}</span><h2>Team directory</h2></div></div>
          {collection.integrityIssues > 0 && <div className="portal-integrity-warning" role="status">Cove omitted invalid contact or date fields, or incomplete source rows, from {collection.integrityIssues} {collection.integrityIssues === 1 ? "directory record" : "directory records"}. Missing values remain visibly unrecorded.</div>}
          <PeopleDirectory people={collection.items} today={today} />
        </section>
      </div>
    </AppShell>
  );
}
