import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AccessManager } from "@/components/admin/access-manager";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getAccessAuditFeed, getAccessDirectory, requirePlatformRole } from "@/lib/access/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administration · Cove",
  description: "Manage Cove people and GitHub-connected applications."
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [identity, params] = await Promise.all([requireEmployeeIdentity(), searchParams]);
  const [, accessDirectory, auditFeed] = await Promise.all([
    requirePlatformRole(identity, ["super_admin", "access_admin"]),
    getAccessDirectory(),
    getAccessAuditFeed(),
  ]);
  const view = params.view === "audit" ? "audit" : "people";
  return (
    <AppShell active="admin" adminSection={view}>
      <AccessManager view={view} accessDirectory={accessDirectory} auditFeed={auditFeed} />
    </AppShell>
  );
}
