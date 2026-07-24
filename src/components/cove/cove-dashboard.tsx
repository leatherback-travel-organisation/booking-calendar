"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type DashboardApplication = {
  id: string;
  name: string;
  description: string;
  href: string;
  slug: string;
  owner: string;
};

type CoveDashboardProps = {
  firstName: string;
  applications: DashboardApplication[];
};

type IconName =
  | "calendar"
  | "money"
  | "profile"
  | "invoice"
  | "receipt"
  | "injury"
  | "search"
  | "external"
  | "star"
  | "arrow"
  | "turtle"
  | "answers"
  | "supplier"
  | "systems"
  | "1mwu"
  | "recruitment";

function CoveIcon({ name }: { name: IconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (name === "search") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.7" {...common}/><path d="m16 16 4 4" {...common}/></svg>;
  if (name === "external") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9" {...common}/><path d="M18 13v6H5V6h6" {...common}/></svg>;
  if (name === "star") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" {...common}/></svg>;
  if (name === "arrow") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" {...common}/></svg>;
  if (name === "calendar") return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="7" width="22" height="20" rx="3" {...common}/><path d="M10 4v6M22 4v6M5 13h22M10 18h4M18 18h4M10 23h4" {...common}/></svg>;
  if (name === "money") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 10h17a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V8a3 3 0 0 1 3-3h15" {...common}/><path d="M21 16h6v6h-6a3 3 0 0 1 0-6Z" {...common}/><circle cx="22" cy="19" r=".8" fill="currentColor"/></svg>;
  if (name === "profile") return <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="24" height="20" rx="3" {...common}/><circle cx="11" cy="14" r="3" {...common}/><path d="M6.5 23c.6-3.6 2.1-5.4 4.5-5.4s3.9 1.8 4.5 5.4M19 12h5M19 16h5M19 20h4" {...common}/></svg>;
  if (name === "invoice") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h13l5 5v21H8zM21 3v6h5" {...common}/><path d="M17 12v12M20.5 15c-.7-1-1.8-1.5-3.5-1.5-2 0-3 1-3 2.5 0 3.7 7 1.3 7 5 0 1.7-1.3 2.7-3.7 2.7-1.6 0-2.9-.5-3.8-1.5" {...common}/></svg>;
  if (name === "receipt") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h16v26l-3-2-3 2-3-2-3 2-4-2zM13 10h6M13 15h6M13 20h4" {...common}/></svg>;
  if (name === "injury") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m10 5 17 17a4 4 0 0 1-5.7 5.7L4.3 10.7A4 4 0 0 1 10 5Z" {...common}/><path d="m10 16 6-6M16 22l6-6M12.5 12.5l7 7M13 17h.1M17 13h.1M18.5 18.5h.1" {...common}/></svg>;
  if (name === "turtle") return <svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="21" rx="10" ry="8" {...common}/><path d="M12 18c-4-3-6-2-7 1 2 2 4 2 7 2M28 19c4-3 6-2 7 1-2 2-4 2-7 2M15 27l-2 5M25 27l2 5M17 14l-2-5M23 14l2-5M15 18l10 7M25 18l-10 7" {...common}/><circle cx="20" cy="21" r="2" {...common}/></svg>;
  if (name === "answers") return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 30c7-12 14-20 22-24-1 9 2 17 8 24M13 28c7-1 13-1 20 0M17 21c4-.7 9-.7 13 0" {...common}/><path d="m31 5 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" fill="currentColor" stroke="none"/></svg>;
  if (name === "systems") return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 5 32 10v9c0 8-4.9 13.1-12 16-7.1-2.9-12-8-12-16v-9l12-5Z" {...common}/><circle cx="20" cy="19" r="4" {...common}/><path d="M20 12v3M20 23v3M13 19h3M24 19h3M15 14l2 2M23 22l2 2M25 14l-2 2M17 22l-2 2" {...common}/></svg>;
  if (name === "recruitment") return <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="12" width="28" height="21" rx="4" {...common}/><path d="M14 12V8h12v4M6 21h28M17 21v4h6v-4" {...common}/></svg>;
  if (name === "1mwu") return <Image className="one-mwu-mark" src="/images/1mwu-logo.png" alt="" width={64} height={64} aria-hidden="true" />;
  return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 26c5-2 9-5 13-10 4 4 9 6 13 7M9 31c6-1 11-3 15-7 3 2 6 3 10 4M20 5v15M15 10l5-5 5 5" {...common}/></svg>;
}

function iconFor(slug: string): IconName {
  if (slug === "superpanel" || slug === "agentic-os") return "systems";
  if (slug === "recruitment") return "recruitment";
  if (slug.includes("trtl")) return "turtle";
  if (slug.includes("answer")) return "answers";
  if (slug.includes("1mwu")) return "1mwu";
  return "supplier";
}

function ApplicationFavicon({ applicationId, slug }: { applicationId: string; slug: string }) {
  const favicon = `/api/app-icons/${applicationId}`;
  const [loadedFavicon, setLoadedFavicon] = useState(false);
  const [failedFavicon, setFailedFavicon] = useState(false);
  const ready = loadedFavicon && !failedFavicon;

  return (
    <span className={`app-tile-icon ${ready ? "favicon-ready" : failedFavicon ? "favicon-unavailable" : "favicon-pending"}`} aria-hidden="true">
      <span className="app-tile-fallback"><CoveIcon name={iconFor(slug)} /></span>
      {!failedFavicon && (
        <Image
          className="app-tile-favicon"
          src={favicon}
          alt=""
          width={48}
          height={48}
          unoptimized
          onLoad={() => setLoadedFavicon(true)}
          onError={() => setFailedFavicon(true)}
        />
      )}
    </span>
  );
}

export function CoveDashboard({ firstName, applications }: CoveDashboardProps) {
  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState<string[]>([]);
  const canUseMoney = applications.some((application) => application.slug === "money");
  const canUseInjuries = applications.some((application) => application.slug === "injuries");
  const needle = query.trim().toLowerCase();
  const filteredApplications = needle
    ? applications.filter((application) =>
        `${application.name} ${application.owner} ${application.description}`.toLowerCase().includes(needle)
      )
    : applications;

  useEffect(() => {
    let frame = 0;
    try {
      const saved = window.localStorage.getItem("cove:favourite-apps");
      if (saved) frame = window.requestAnimationFrame(() => setFavourites(JSON.parse(saved) as string[]));
    } catch {
      // The launcher remains usable when browser storage is unavailable.
    }
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleFavourite(id: string) {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { window.localStorage.setItem("cove:favourite-apps", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  return (
    <div className="cove-dashboard">
      <section className="welcome-banner" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="welcome-kicker">Your Leatherback workspace</span>
          <h1 id="welcome-title">Welcome back, {firstName}! <span aria-hidden="true">👋</span></h1>
          <p>You&apos;re in the Cove.<br />Everything you need, in one place.</p>
        </div>
      </section>

      {(canUseMoney || canUseInjuries) && <section className="quick-actions" aria-labelledby="quick-title">
        <h2 id="quick-title">Quick Actions</h2>
        {canUseMoney && <a href="/money?new=invoice" className="quick-action quick-invoice"><CoveIcon name="invoice" /><span>Submit Invoice</span><CoveIcon name="arrow" /></a>}
        {canUseMoney && <a href="/money?new=reimbursement" className="quick-action quick-receipt"><CoveIcon name="receipt" /><span>Submit Receipt for Reimbursement</span><CoveIcon name="arrow" /></a>}
        {canUseInjuries && <a href="/injuries" className="quick-action quick-injury"><CoveIcon name="injury" /><span>Register an Injury</span><CoveIcon name="arrow" /></a>}
      </section>}

      <section className="utility-grid" aria-label="Employee services">
          <a href="/leave" className="utility-card utility-lagoon">
            <span className="utility-copy">
              <span className="utility-heading"><span className="utility-icon"><CoveIcon name="calendar" /></span><strong>Leave</strong></span>
              <small>The leave system is not connected yet. Cove will not invent balances or accept requests.</small>
              <span className="utility-cta">View integration status</span>
            </span>
          </a>
          {canUseMoney &&
          <a href="/money" className="utility-card utility-violet">
            <span className="utility-copy">
              <span className="utility-heading"><span className="utility-icon"><CoveIcon name="money" /></span><strong>Your Money</strong></span>
              <small>Travel credits, invoices, reimbursements and more.</small>
              <span className="utility-cta">Open money</span>
            </span>
          </a>}
          <a href="/my-details" className="utility-card utility-sky">
            <span className="utility-copy">
              <span className="utility-heading"><span className="utility-icon"><CoveIcon name="profile" /></span><strong>My Details</strong></span>
              <small>Review your personal and employment details from the HR table.</small>
              <span className="utility-cta">Open My Details</span>
            </span>
          </a>
      </section>

      <section className="launcher-panel" aria-labelledby="apps-title">
        <header className="launcher-header">
          <div><span className="section-kicker">Workspace</span><h2 id="apps-title">Your Apps</h2></div>
          <label className="app-search">
            <span className="sr-only">Search applications</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps…" />
            <CoveIcon name="search" />
          </label>
        </header>

        <div className="launcher-grid">
          {filteredApplications.map((application, index) => {
            const favourite = favourites.includes(application.id);
            return (
              <article className={`launcher-card launcher-card-${index % 3} launcher-card-${application.slug}`} key={application.id}>
                <a href={application.href} target="_blank" rel="noreferrer" className="launcher-main" aria-label={`Open ${application.name}`}>
                  <ApplicationFavicon applicationId={application.id} slug={application.slug} />
                  <span className="app-tile-copy"><strong>{application.name}</strong><small>{application.owner}</small></span>
                  <span className="external-icon"><CoveIcon name="external" /></span>
                </a>
                <button type="button" className={`favourite-button ${favourite ? "is-favourite" : ""}`} onClick={() => toggleFavourite(application.id)} aria-pressed={favourite} aria-label={`${favourite ? "Remove" : "Add"} ${application.name} ${favourite ? "from" : "to"} favourites`}><CoveIcon name="star" /></button>
              </article>
            );
          })}
          {filteredApplications.length === 0 && applications.length === 0 && (
            <div className="empty-apps empty-apps-unassigned">
              <span className="empty-apps-icon" aria-hidden="true"><CoveIcon name="external" /></span>
              <strong>No applications assigned yet</strong>
              <p>Your Cove account is active. An administrator can add User or Admin access from People &amp; access.</p>
            </div>
          )}
          {filteredApplications.length === 0 && applications.length > 0 && (
            <div className="empty-apps empty-apps-search">
              <span className="empty-apps-icon" aria-hidden="true"><CoveIcon name="search" /></span>
              <strong>No matching applications</strong>
              <p>Nothing matches “{query}”. Try another name or clear the search.</p>
              <button type="button" onClick={() => setQuery("")}>Clear search</button>
            </div>
          )}
        </div>
        <p className="access-note">Apps are personalised to your role and managed securely through SuperPanel.</p>
      </section>

    </div>
  );
}
