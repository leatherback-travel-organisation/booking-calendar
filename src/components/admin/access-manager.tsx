"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  changeAccessUserStatus,
  changeApplicationAccess,
  changePlatformAdmin,
  changeSystemsAccess,
  inviteAccessUser,
} from "@/lib/access/actions";
import type {
  AccessActionResult,
  AccessDirectory,
  AccessDirectoryStatus,
} from "@/lib/access/admin-model";
import type { AuditFeed, AuditFeedEvent } from "@/lib/access/audit-integrity";
import { SUPERPANEL_APPLICATION_SLUG } from "@/lib/access/application-ids";
import styles from "./access-manager.module.css";

export type AdminView = "people" | "audit";
type PeopleFilter = "all" | "active" | "invited" | "suspended";

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: AccessDirectoryStatus) {
  if (status === "active") return styles.activeStatus;
  if (status === "invited" || status === "invitation_expired") return styles.invitedStatus;
  return styles.suspendedStatus;
}

function personStatusLabel(status: AccessDirectoryStatus) {
  if (status === "deprovisioned") return "Removed";
  if (status === "invitation_expired") return "Invite expired";
  if (status === "invitation_revoked") return "Invite revoked";
  return titleCase(status);
}

function statusMatchesFilter(status: AccessDirectoryStatus, filter: PeopleFilter) {
  if (filter === "all") return true;
  if (filter === "invited") {
    return status === "invited" || status === "invitation_expired" || status === "invitation_revoked";
  }
  return status === filter;
}

function lastSignIn(value?: string) {
  if (!value) return "Not signed in";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}


function AdminHeader({ view, action }: { view: AdminView; action?: React.ReactNode }) {
  const title = view === "people" ? "People & access" : "Audit trail";
  const description = view === "people"
    ? "Approve who may enter Cove, then assign User or Admin access per application."
    : "Review recent identity, access and entitlement activity from the append-only security ledger.";
  return (
    <header className={styles.adminHeader}>
      <div className={styles.adminTitleRow}>
        <div>
          <span className={styles.kicker}>Cove administration</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.headerActions}>
          {view === "people" && <span className={styles.adminMode}><i aria-hidden="true" />Admin mode</span>}
          {action}
        </div>
      </div>
      <nav className={styles.adminTabs} aria-label="Administration sections">
        <Link href="/admin" aria-current={view === "people" ? "page" : undefined} className={view === "people" ? styles.activeTab : ""}>People & access</Link>
        <Link href="/admin?view=audit" aria-current={view === "audit" ? "page" : undefined} className={view === "audit" ? styles.activeTab : ""}>Audit trail</Link>
        <Link href="/admin/money">Money</Link>
      </nav>
    </header>
  );
}

function auditActionLabel(action: string) {
  return action.split(".").map(titleCase).join(" · ");
}

function auditTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function auditSearchText(event: AuditFeedEvent) {
  return [
    event.action,
    event.outcome,
    event.actorName,
    event.applicationName,
    event.targetType,
    event.targetId,
    event.requestId,
    ...Object.entries(event.metadata ?? {}).flatMap(([key, value]) => [key, String(value)]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function AuditWorkspace({ feed }: { feed: AuditFeed }) {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<"all" | AuditFeedEvent["outcome"]>("all");
  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return feed.events.filter((event) =>
      (outcome === "all" || event.outcome === outcome) &&
      (!needle || auditSearchText(event).includes(needle))
    );
  }, [feed.events, outcome, query]);
  const counts = {
    success: feed.events.filter((event) => event.outcome === "success").length,
    denied: feed.events.filter((event) => event.outcome === "denied").length,
    error: feed.events.filter((event) => event.outcome === "error").length,
  };

  return (
    <div className={styles.workspace}>
      <AdminHeader view="audit" action={<span className={styles.adminMode}><i aria-hidden="true" />Read only</span>} />

      <section className={styles.auditMetrics} aria-label="Audit event summary">
        <article><strong>{feed.events.length}</strong><span>Recent events</span><small>Verified ledger window</small></article>
        <article><strong>{counts.success}</strong><span>Successful</span><small>Completed controls</small></article>
        <article><strong>{counts.denied}</strong><span>Denied</span><small>Blocked attempts</small></article>
        <article className={counts.error ? styles.auditMetricAlert : ""}><strong>{counts.error}</strong><span>Errors</span><small>Operational failures</small></article>
      </section>

      {feed.message && <div className={styles.auditSource} role="note"><span className={`${styles.sourceBadge} ${styles[`source${titleCase(feed.source)}`]}`}>{feed.source === "postgres" ? "Live ledger" : feed.source === "demo" ? "Demonstration events" : "Audit unavailable"}</span><p>{feed.message}</p></div>}

      <section className={styles.panel} aria-labelledby="audit-events-title">
        <div className={styles.panelHeader}>
          <div><span className={styles.kicker}>Security ledger</span><h2 id="audit-events-title">Recent activity</h2></div>
          <span className={styles.recordCount}>{filteredEvents.length} of {feed.events.length} shown</span>
        </div>

        {feed.events.length > 0 && (
          <div className={styles.auditToolbar}>
            <label className={styles.appSearch}><span aria-hidden="true">⌕</span><input type="search" aria-label="Search audit events" placeholder="Search actor, action, app or request…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className={styles.appSelect}><span>Outcome</span><select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="all">All outcomes</option><option value="success">Success</option><option value="denied">Denied</option><option value="error">Error</option></select></label>
          </div>
        )}

        {feed.events.length === 0 ? (
          <div className={styles.auditEmpty}>
            <span aria-hidden="true">◎</span>
            <h2>{feed.source === "unavailable" ? "No verified events can be shown" : "No audit events have been recorded"}</h2>
            <p>{feed.source === "unavailable" ? "Cove is withholding partial or untrusted ledger data until the audit source is healthy." : "Security and access activity will appear here after the first recorded event."}</p>
          </div>
        ) : (
          <ol className={styles.auditList} aria-label="Audit events">
            {filteredEvents.map((event) => (
              <li key={event.id}>
                <article className={styles.auditEvent}>
                  <span className={`${styles.auditOutcome} ${styles[`audit${titleCase(event.outcome)}`]}`} aria-label={`Outcome: ${event.outcome}`}><i aria-hidden="true">{event.outcome === "success" ? "✓" : event.outcome === "denied" ? "×" : "!"}</i></span>
                  <div className={styles.auditEventBody}>
                    <div className={styles.auditEventHeading}><div><span className={styles.kicker}>{event.applicationName ?? "Cove control plane"}</span><h3>{auditActionLabel(event.action)}</h3></div><time dateTime={event.occurredAt}>{auditTimestamp(event.occurredAt)}</time></div>
                    <p><strong>{event.actorName}</strong>{event.targetType ? ` acted on ${titleCase(event.targetType)}` : " completed a system event"}.</p>
                    {Object.keys(event.metadata ?? {}).length > 0 && <dl className={styles.auditMetadata}>{Object.entries(event.metadata ?? {}).map(([key, value]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{value === null ? "Not recorded" : String(value)}</dd></div>)}</dl>}
                    <footer><span>{event.targetId ? `${titleCase(event.targetType ?? "target")}: ${event.targetId}` : "No target recorded"}</span><span>{event.requestId ? `Request: ${event.requestId}` : "No request ID"}</span></footer>
                  </div>
                </article>
              </li>
            ))}
            {filteredEvents.length === 0 && <li className={styles.noMatches}>No audit events match these filters.</li>}
          </ol>
        )}
      </section>
    </div>
  );
}

function PeopleWorkspace({ initialDirectory }: { initialDirectory: AccessDirectory }) {
  const [directory, setDirectory] = useState(initialDirectory);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const users = directory.people;
  const selectedUser = users.find((user) => user.id === selectedId) ?? null;
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !needle || `${user.name} ${user.email}`.toLowerCase().includes(needle);
      return matchesQuery && statusMatchesFilter(user.status, filter);
    });
  }, [filter, query, users]);

  useEffect(() => {
    if (!selectedUser) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedUser]);

  function applyResult(result: AccessActionResult, preferredEmail?: string) {
    setNotice(result.message);
    if (!result.ok) return;
    setDirectory(result.directory);
    if (preferredEmail) {
      const selected = result.directory.people.find((person) => person.email === preferredEmail);
      if (selected) setSelectedId(selected.id);
    }
  }

  function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === email)) {
      setNotice("That email is already approved for Cove.");
      return;
    }

    const name = inviteName.trim();
    startTransition(async () => {
      const result = await inviteAccessUser({ name, email, requestId: crypto.randomUUID() });
      applyResult(result, email);
      if (result.ok) {
        setInviteName("");
        setInviteEmail("");
        setShowInvite(false);
      }
    });
  }

  function setAppAccess(applicationSlug: string, level: "user" | "admin" | null) {
    if (!selectedUser) return;
    startTransition(async () => {
      applyResult(await changeApplicationAccess({ userId: selectedUser.id, applicationSlug, level, requestId: crypto.randomUUID() }));
    });
  }

  function toggleStatus() {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === "suspended" ? "active" : "suspended";
    startTransition(async () => {
      applyResult(await changeAccessUserStatus({ userId: selectedUser.id, status: nextStatus, requestId: crypto.randomUUID() }));
    });
  }

  function toggleAdministrator() {
    if (!selectedUser) return;
    const enabled = !selectedUser.platformRoles.includes("access_admin");
    startTransition(async () => {
      applyResult(await changePlatformAdmin({ userId: selectedUser.id, enabled, requestId: crypto.randomUUID() }));
    });
  }

  function toggleSystemsTeam() {
    if (!selectedUser) return;
    const enabled = !selectedUser.platformRoles.includes("systems_admin");
    startTransition(async () => {
      applyResult(await changeSystemsAccess({ userId: selectedUser.id, enabled, requestId: crypto.randomUUID() }));
    });
  }

  function renewInvitation() {
    if (!selectedUser || selectedUser.population !== "employee") return;
    startTransition(async () => {
      applyResult(await inviteAccessUser({
        name: selectedUser.name,
        email: selectedUser.email,
        requestId: crypto.randomUUID(),
      }), selectedUser.email);
    });
  }

  return (
    <div className={styles.workspace}>
      <AdminHeader
        view="people"
        action={<button className={styles.primaryButton} type="button" disabled={!directory.writable || isPending} onClick={() => setShowInvite((open) => !open)}>{showInvite ? "Cancel" : "Invite person"}</button>}
      />

      <section className={styles.accessRule} aria-label="Cove access policy">
        <span className={styles.lockIcon} aria-hidden="true" />
        <div><strong>Invite-only access</strong><p>A Google account verifies identity. It never grants Cove access on its own.</p></div>
        <span className={styles.ruleBadge}>Default: deny</span>
      </section>

      {directory.message && <div className={styles.notice} role="note"><span />{directory.message}</div>}
      {notice && <div className={styles.notice} role="status" aria-live="polite"><span />{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}

      {showInvite && (
        <form className={styles.inviteForm} onSubmit={inviteUser}>
          <div className={styles.formIntro}><span className={styles.kicker}>New Cove account</span><h2>Approve a person</h2><p>This creates the allowlist record first. Google verification happens later.</p></div>
          <label>Full name<input required value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Person’s name" /></label>
          <label>Work email used for Google sign-in<input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" /></label>
          <button className={styles.primaryButton} type="submit" disabled={isPending}>{isPending ? "Saving…" : "Approve for Cove"}</button>
        </form>
      )}

      <div className={styles.peopleLayout}>
        <section className={styles.panel} aria-labelledby="directory-title">
          {users.length === 0 && <div className={styles.panelHeader}><div><span className={styles.kicker}>Access directory</span><h2 id="directory-title">Approved people</h2></div><span className={styles.recordCount}>0 records</span></div>}
          {users.length > 0 && (
            <div className={styles.directoryToolbar}>
              <div className={styles.directoryTitle}><span className={styles.kicker}>Access directory</span><h2 id="directory-title">Approved people</h2></div>
              <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Search approved people" placeholder="Search people…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <div className={styles.filters} aria-label="Filter people by status">
                {(["all", "active", "invited", "suspended"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? styles.filterActive : ""} onClick={() => setFilter(item)}>{titleCase(item)}</button>)}
              </div>
              <span className={styles.recordCount}>{filteredUsers.length} of {users.length}</span>
            </div>
          )}

          {users.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIllustration} aria-hidden="true"><i /><i /></span>
              <span className={styles.kicker}>No placeholder data</span>
              <h2>{directory.writable ? "No one has been approved yet" : "No live people are shown"}</h2>
              <p>{directory.writable ? "Invite the first person to create a persistent Cove access record. Until then, every Google sign-in is denied." : "Connect through the authenticated live environment to view and change the real access directory."}</p>
              {directory.writable && <button className={styles.secondaryButton} type="button" onClick={() => setShowInvite(true)}>Invite the first person</button>}
            </div>
          ) : (
            <div className={styles.userList}>
              <div className={styles.listHead}><span>Person</span><span>Status</span><span>Cove role</span><span>Systems</span><span>Apps</span><span>Last sign-in</span><span /></div>
              {filteredUsers.map((user) => {
                const isSuperAdmin = user.platformRoles.includes("super_admin");
                const isAccessAdmin = user.platformRoles.includes("access_admin");
                const hasSystemsAccess = isSuperAdmin || user.platformRoles.includes("systems_admin");
                const applicationCount = Object.keys(user.applicationAccess).length;
                return (
                  <button type="button" className={`${styles.userRow} ${selectedId === user.id ? styles.selectedRow : ""}`} key={user.id} aria-expanded={selectedId === user.id} aria-controls="selected-person-access" onClick={() => setSelectedId(user.id)}>
                    <span className={styles.personCell}><i>{user.initials}</i><span><strong>{user.name}</strong><small>{user.email}</small></span></span>
                    <span><i className={`${styles.status} ${statusClass(user.status)}`}>{personStatusLabel(user.status)}</i></span>
                    <span><strong>{isSuperAdmin ? "Super admin" : isAccessAdmin ? "Access admin" : "Member"}</strong><small>{user.population === "employee" ? "Employee" : "External partner"}</small></span>
                    <span className={hasSystemsAccess ? styles.compactReady : styles.compactNeutral}><strong>{hasSystemsAccess ? "Enabled" : "No access"}</strong><small>{hasSystemsAccess ? "SuperPanel" : "—"}</small></span>
                    <span><strong>{applicationCount}</strong><small>{applicationCount === 1 ? "application" : "applications"}</small></span>
                    <span><strong>{lastSignIn(user.lastAuthenticatedAt)}</strong><small>{user.lastAuthenticatedAt ? "Verified Google identity" : "Awaiting first sign-in"}</small></span>
                    <span className={styles.rowArrow} aria-hidden="true">›</span>
                  </button>
                );
              })}
              {filteredUsers.length === 0 && <div className={styles.noMatches}>No people match this filter.</div>}
            </div>
          )}
        </section>
      </div>

      {selectedUser && (
        <div className={styles.detailBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <aside id="selected-person-access" className={styles.userDetail} role="dialog" aria-modal="true" aria-label={`${selectedUser.name} access`}>
            <header><button type="button" aria-label="Close person details" onClick={() => setSelectedId(null)}>×</button><span className={styles.detailAvatar}>{selectedUser.initials}</span><h2>{selectedUser.name}</h2><p>{selectedUser.email}</p><span className={`${styles.status} ${statusClass(selectedUser.status)}`}>{personStatusLabel(selectedUser.status)}</span></header>
            <div className={styles.detailBody}>
              {(selectedUser.status === "invitation_expired" || selectedUser.status === "invitation_revoked") && selectedUser.population === "employee" && <section><span className={styles.kicker}>Identity invitation</span><div className={styles.roleRow}><div><strong>{selectedUser.status === "invitation_expired" ? "Approval window expired" : "Invitation was revoked"}</strong><small>Renewing creates a fresh 14-day identity-binding window.</small></div><button type="button" disabled={!directory.writable || isPending} onClick={renewInvitation}>Renew</button></div></section>}
              <section><span className={styles.kicker}>Cove role</span><div className={styles.roleRow}><div><strong>{selectedUser.platformRoles.includes("super_admin") ? "Super admin" : selectedUser.platformRoles.includes("access_admin") ? "Access admin" : "Member"}</strong><small>{selectedUser.population !== "employee" ? "Partner accounts cannot administer Cove" : selectedUser.platformRoles.length ? "Can administer Cove within assigned duties" : "Uses assigned applications"}</small></div><button type="button" disabled={!directory.writable || isPending || selectedUser.population !== "employee" || selectedUser.platformRoles.includes("super_admin")} onClick={toggleAdministrator}>{selectedUser.platformRoles.includes("access_admin") ? "Remove" : "Make admin"}</button></div></section>
              <section><span className={styles.kicker}>Systems team</span><div className={styles.roleRow}><div><strong>{selectedUser.platformRoles.includes("super_admin") || selectedUser.platformRoles.includes("systems_admin") ? "SuperPanel access" : "No systems access"}</strong><small>Controls GitHub publishing, Vercel applications, websites and automated hygiene.</small></div><button type="button" disabled={!directory.writable || isPending || selectedUser.population !== "employee" || selectedUser.platformRoles.includes("super_admin")} onClick={toggleSystemsTeam}>{selectedUser.platformRoles.includes("systems_admin") ? "Remove" : "Add to team"}</button></div></section>
              <section>
                <span className={styles.kicker}>Application access</span>
                <p className={styles.accessHelp}>{selectedUser.population === "employee" ? "Choose one provision for applications with selected-user access. Company-wide applications are managed in SuperPanel and are not listed here." : "External-partner provisioning is not available in this employee administration flow."}</p>
                <div className={styles.appAccessList}>
                  {directory.applications.filter((app) => app.slug !== SUPERPANEL_APPLICATION_SLUG && app.employeeAccessPolicy !== "all").map((app) => {
                    const level = selectedUser.applicationAccess[app.slug] ?? null;
                    return (
                      <div className={styles.appAccessRow} key={app.id}>
                        <span><strong>{app.name}</strong><small>{level ? `${titleCase(level)} access` : "No access"}</small></span>
                        <div className={styles.accessPicker} role="group" aria-label={`${app.name} access level`}>
                          <button type="button" aria-pressed={!level} disabled={!directory.writable || isPending || selectedUser.population !== "employee"} className={!level ? styles.accessSelected : ""} onClick={() => setAppAccess(app.slug, null)}>None</button>
                          <button type="button" aria-pressed={level === "user"} disabled={!directory.writable || isPending || selectedUser.population !== "employee"} className={level === "user" ? styles.userSelected : ""} onClick={() => setAppAccess(app.slug, "user")}>User</button>
                          <button type="button" aria-pressed={level === "admin"} disabled={!directory.writable || isPending || selectedUser.population !== "employee"} className={level === "admin" ? styles.adminSelected : ""} onClick={() => setAppAccess(app.slug, "admin")}>Admin</button>
                        </div>
                      </div>
                    );
                  })}
                  {directory.applications.filter((app) => app.slug !== SUPERPANEL_APPLICATION_SLUG && app.employeeAccessPolicy !== "all").length === 0 && <p className={styles.accessHelp}>There are no applications requiring individual access decisions.</p>}
                </div>
              </section>
              <button
                className={selectedUser.status === "suspended" ? styles.restoreButton : styles.dangerButton}
                type="button"
                disabled={!directory.writable || isPending || (selectedUser.status !== "suspended" && selectedUser.platformRoles.includes("super_admin"))}
                title={selectedUser.status !== "suspended" && selectedUser.platformRoles.includes("super_admin") ? "Super-admin accounts require a reviewed recovery process." : undefined}
                onClick={toggleStatus}
              >{selectedUser.status === "suspended" ? "Restore access" : "Suspend access"}</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}


export function AccessManager({ view, accessDirectory, auditFeed }: {
  view: AdminView;
  accessDirectory: AccessDirectory;
  auditFeed: AuditFeed;
}) {
  if (view === "audit") return <AuditWorkspace feed={auditFeed} />;
  return <PeopleWorkspace initialDirectory={accessDirectory} />;
}
