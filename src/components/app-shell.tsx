import Image from "next/image";
import Link from "next/link";
import { BrandsIcon, CompassIcon, GardenIcon, PeopleIcon } from "./icons";
import { AccountMenu } from "./account-menu";
import { identityMode, requireEmployeeIdentity } from "@/lib/identity/server";
import { accessibleApplicationsFor, requireCoveUser } from "@/lib/access/server";

type AppShellProps = {
  active: "home" | "people" | "brands" | "garden" | "money" | "recruitment" | "app-builder" | "admin" | "systems" | "booking";
  adminSection?: "people" | "audit" | "money" | "injuries";
  systemsSection?: "apps" | "websites";
  children: React.ReactNode;
};

export async function AppShell({ active, adminSection = "people", systemsSection = "apps", children }: AppShellProps) {
  const identity = await requireEmployeeIdentity();
  const mode = identityMode();
  const accessUser = await requireCoveUser(identity);
  const canManageAccess = accessUser.platformRoles.some((role) => role === "super_admin" || role === "access_admin");
  // The Garden link keys off the live application registry, so pre-launch
  // (status: maintenance) it stays hidden without a code change.
  const applications = await accessibleApplicationsFor(identity).catch(() => []);
  const showGarden = applications.some((application) => application.slug === "garden");
  const canManageSystems = accessUser.platformRoles.some((role) => role === "super_admin" || role === "systems_admin");
  const adminHref = adminSection === "money" ? "/admin/money" : adminSection === "injuries" ? "/admin/injuries" : `/admin${adminSection === "audit" ? "?view=audit" : ""}`;
  const systemsHref = systemsSection === "websites" ? "/systems?view=websites" : "/systems";

  return (
    <div className={`cove-portal-shell ${active === "home" ? "cove-home-shell" : ""} ${active === "admin" || active === "systems" || active === "app-builder" ? "cove-admin-shell" : ""} ${active === "recruitment" ? "cove-recruitment-shell" : ""} ${active === "booking" ? "cove-booking-shell" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="cove-topnav">
        <Link href="/" className="cove-logo" aria-label="Cove home">
          <Image
            className="cove-logo-image"
            src="/images/cove-logo.png"
            alt=""
            width={1448}
            height={1086}
            sizes="(max-width: 760px) 160px, 215px"
            priority
            aria-hidden="true"
          />
        </Link>

        <nav className="cove-primary-nav" aria-label="Primary navigation">
          <Link href="/" aria-current={active === "home" ? "page" : undefined} className={`cove-nav-link ${active === "home" ? "active" : ""}`}><CompassIcon className="cove-nav-icon" /><span>Home</span></Link>
          <Link href="/people" aria-current={active === "people" ? "page" : undefined} className={`cove-nav-link ${active === "people" ? "active" : ""}`}><PeopleIcon className="cove-nav-icon" /><span>People</span></Link>
          <Link href="/brands" aria-current={active === "brands" ? "page" : undefined} className={`cove-nav-link ${active === "brands" ? "active" : ""}`}><BrandsIcon className="cove-nav-icon" /><span>Brands</span></Link>
          {showGarden ? <Link href="/garden" aria-current={active === "garden" ? "page" : undefined} className={`cove-nav-link ${active === "garden" ? "active" : ""}`}><GardenIcon className="cove-nav-icon" /><span>Garden</span></Link> : null}
        </nav>

        <div className="cove-profile-area">
          <AccountMenu
            displayName={identity.displayName}
            initials={identity.initials}
            subtitle={mode === "preview" ? "Demonstration account" : "Leatherback employee"}
            mode={mode}
            canManageAccess={canManageAccess}
            canManageSystems={canManageSystems}
            adminHref={adminHref}
            systemsHref={systemsHref}
          />
          {canManageAccess ? <Link className={`profile-admin ${active === "admin" ? "active" : ""}`} href={adminHref} aria-label="Open Cove administration" aria-current={active === "admin" ? "page" : undefined}>Admin</Link> : null}
          {canManageSystems ? <Link className={`profile-admin ${active === "systems" ? "active" : ""}`} href={systemsHref} aria-label="Open SuperPanel systems control" aria-current={active === "systems" ? "page" : undefined}>Systems</Link> : null}
        </div>
      </header>
      <main id="main-content" className="cove-portal-main" tabIndex={-1}>{children}</main>
    </div>
  );
}
