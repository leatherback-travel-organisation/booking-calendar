import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BrandBrowser } from "@/components/brands/brand-browser";
import { getBrands } from "@/lib/airtable/server";
import { hasPlatformRole, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brands · Cove",
  description: "Explore the Leatherback Travel brand collection.",
};

export default async function BrandsPage() {
  const identity = await requireEmployeeIdentity();
  await requireCoveUser(identity);
  const [collection, canManage] = await Promise.all([
    getBrands(),
    hasPlatformRole(identity, ["super_admin", "access_admin"]),
  ]);

  return (
    <AppShell active="brands">
      <div className="brands-page">
        <header className="workspace-page-header">
          <div><span className="section-kicker">Workspace</span><h1>Brands</h1><p>Explore the identities that make up the Leatherback family.</p></div>
          <div className="workspace-page-stat"><strong>{collection.items.length}</strong><span>brands in the collection</span></div>
        </header>

        <section className="portal-data-panel">
          <div className="portal-data-heading">
            <div><span className={`source-pill source-${collection.origin}`}>{collection.origin === "airtable" ? "Live from Airtable" : collection.origin === "preview" ? "Demonstration data" : "Brand data unavailable"}</span><h2>Brand directory</h2></div>
            {canManage && <Link className="brand-admin-link" href="/admin">Admin access <span>Brand editing will live here next</span></Link>}
          </div>
          {collection.integrityIssues > 0 && <div className="portal-integrity-warning" role="status">Cove omitted unsafe links or incomplete source rows from {collection.integrityIssues} {collection.integrityIssues === 1 ? "brand" : "brands"}. No replacement destinations were invented.</div>}
          <BrandBrowser brands={collection.items} />
        </section>
      </div>
    </AppShell>
  );
}
