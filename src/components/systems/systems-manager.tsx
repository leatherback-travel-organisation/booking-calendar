"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { approveApplicationSso, prepareApplicationSso, refreshApplicationSso, registerExistingAsset, updateManagedAsset } from "@/lib/systems/actions";
import type { ActiveCovePerson, ApplicationAccessSummary, AssetKind, ManagedAsset } from "@/lib/systems/model";
import { COVE_SSO_STATE_PRESENTATION, type CoveSsoIntegration } from "@/lib/systems/sso-model";
import type { GitHubRepositoryInventory } from "@/lib/telemetry/github-inventory";
import type { AssetHygiene, AssetTelemetry, IntegrationState } from "@/lib/telemetry/model";
import styles from "./systems-manager.module.css";

type AssetRecord = {
  asset: ManagedAsset;
  telemetry: AssetTelemetry;
  hygiene?: AssetHygiene;
  access?: ApplicationAccessSummary;
  sso?: CoveSsoIntegration;
};

type HarmonisationBucket = "harmonised" | "in_progress" | "needs_attention" | "not_started";

function harmonisationBucket(record: AssetRecord): HarmonisationBucket {
  const state = record.sso?.state ?? "not_configured";
  if (state === "active") return "harmonised";
  if (state === "needs_attention") return "needs_attention";
  if (state === "not_configured") return "not_started";
  return "in_progress";
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sensitivityLabel(risk: ManagedAsset["risk"]) {
  if (risk === "restricted") return "Highly sensitive";
  if (risk === "sensitive") return "Personal data";
  return "Internal";
}

function dateLabel(value?: string) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function hostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "Invalid production URL";
  }
}

function mark(asset: ManagedAsset) {
  return asset.slug === "1mwu" ? "1" : asset.name.slice(0, 1).toUpperCase();
}

function integrationReady(state: IntegrationState) {
  return state === "connected" || state === "not_applicable";
}

function recordStatus(record: AssetRecord) {
  if (!record.asset.productOwnerUserId) return { label: "Owner required", detail: "Assign accountable owner", pending: true };
  if (!record.asset.repository) return { label: "Source connection needed", detail: "Connect a private GitHub repository", pending: true };
  if (record.asset.assetKind === "application") {
    const state = record.sso?.state ?? "not_configured";
    const presentation = COVE_SSO_STATE_PRESENTATION[state];
    return { label: presentation.label, detail: presentation.description, pending: state !== "active" };
  }
  if (record.hygiene?.state === "ready") return { label: "Ready", detail: `${record.hygiene.checks.length} checks passed`, pending: false };
  if (record.hygiene?.state === "needs_work") {
    const passed = record.hygiene.checks.filter((check) => check.status === "passed").length;
    return { label: "Needs work", detail: `${passed} of ${record.hygiene.checks.length} checks passed`, pending: true };
  }
  if (record.hygiene) return { label: "Evidence incomplete", detail: "Live evidence is unavailable", pending: true };
  return { label: "Scan pending", detail: "No automated scan yet", pending: true };
}

function SystemsHeader({ assetKind, total, needsWork, onRegister }: { assetKind: AssetKind; total: number; needsWork: number; onRegister: () => void }) {
  const websites = assetKind === "website";
  const label = websites ? "website" : "application";
  return (
    <header className={styles.header}>
      <div className={styles.headerLead}><span className={styles.kicker}>SuperPanel</span><h1>{websites ? "Websites" : "Applications"}</h1><p>{needsWork > 0 ? `${needsWork} ${needsWork === 1 ? "item needs" : "items need"} attention.` : `All registered ${websites ? "websites" : "applications"} are ready.`}</p></div>
      <nav aria-label="Systems sections"><Link href="/systems" aria-current={!websites ? "page" : undefined}>Applications</Link><Link href="/systems?view=websites" aria-current={websites ? "page" : undefined}>Websites</Link><Link href="/systems/control-room">Control room</Link></nav>
      <div className={styles.headerSummary} aria-label={`${titleCase(label)} summary`}><span><strong>{total}</strong> registered</span><span data-warning={needsWork > 0}><strong>{needsWork}</strong> needs work</span><button className={styles.primary} type="button" onClick={onRegister}>Register {label}</button></div>
    </header>
  );
}

function HarmonisationOverview({
  records,
  filter,
  onFilter,
}: {
  records: readonly AssetRecord[];
  filter: HarmonisationBucket | "all";
  onFilter: (filter: HarmonisationBucket | "all") => void;
}) {
  const counts = {
    harmonised: records.filter((record) => harmonisationBucket(record) === "harmonised").length,
    in_progress: records.filter((record) => harmonisationBucket(record) === "in_progress").length,
    needs_attention: records.filter((record) => harmonisationBucket(record) === "needs_attention").length,
    not_started: records.filter((record) => harmonisationBucket(record) === "not_started").length,
  };
  const registered = records.filter((record) => !record.asset.id.startsWith("directory-")).length;
  const sourceMissing = records.filter((record) => !record.asset.repository).length;
  const progress = records.length ? Math.round((counts.harmonised / records.length) * 100) : 0;
  const choices: readonly { key: HarmonisationBucket; label: string; detail: string }[] = [
    { key: "harmonised", label: "Harmonised", detail: "Production evidence passed" },
    { key: "in_progress", label: "In progress", detail: "Prepared, checking or awaiting approval" },
    { key: "needs_attention", label: "Needs attention", detail: "A real dependency is blocking progress" },
    { key: "not_started", label: "Not started", detail: "Registered, but no Cove workflow yet" },
  ];

  return <section className={styles.harmonisation} aria-labelledby="harmonisation-title">
    <div className={styles.harmonisationLead}>
      <div>
        <span className={styles.kicker}>Estate programme</span>
        <h2 id="harmonisation-title">Cove harmonisation</h2>
        <p>One shared sign-in, one central access decision and one verified production source for every application.</p>
      </div>
      <button type="button" className={styles.auditMode} aria-pressed={filter === "all"} onClick={() => onFilter("all")}>
        <span aria-hidden="true">◎</span>
        <strong>{progress}% complete</strong>
        <small>{records.length} known · {registered} in Systems · {sourceMissing} without canonical source</small>
      </button>
    </div>
    <div className={styles.harmonisationProgress} aria-label={`${progress}% of applications harmonised`}><i style={{ width: `${progress}%` }} /></div>
    <div className={styles.harmonisationStats}>
      {choices.map((choice) => <button type="button" key={choice.key} data-status={choice.key} aria-pressed={filter === choice.key} onClick={() => onFilter(filter === choice.key ? "all" : choice.key)}>
        <span>{counts[choice.key]}</span>
        <div><strong>{choice.label}</strong><small>{choice.detail}</small></div>
      </button>)}
    </div>
    <footer><span>Audit-first rollout</span><p>Application changes stay in each canonical repository and require review, production evidence and rollback readiness before Cove marks them complete.</p></footer>
  </section>;
}

function RepositoryInventory({ inventory }: { inventory: GitHubRepositoryInventory }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const repositories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inventory.repositories.filter((repo) => !needle || `${repo.name} ${repo.description ?? ""} ${repo.language ?? ""}`.toLowerCase().includes(needle));
  }, [inventory.repositories, query]);
  const registered = inventory.repositories.filter((repo) => repo.registeredAssetId).length;

  const connected = inventory.state === "connected";
  return <section className={styles.githubPanel} aria-labelledby="github-inventory-title" data-expanded={expanded}>
    <header><span className={styles.githubMark} aria-hidden="true">⌘</span><div className={styles.githubIntro}><h2 id="github-inventory-title">GitHub inventory</h2><p>{connected ? `${inventory.repositories.length} repositories · ${registered} registered · ${inventory.repositories.length - registered} awaiting registration` : inventory.message}</p></div><div className={styles.githubActions}><span className={connected ? styles.connected : styles.disconnected}><i />{connected ? "Connected" : "Needs connection"}</span>{connected && <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "Hide repositories" : "View repositories"}</button>}<button type="button" disabled={isRefreshing} onClick={() => startRefresh(() => router.refresh())}>{isRefreshing ? "Refreshing…" : "Refresh"}</button></div></header>
    {connected && expanded && <>
      <div className={styles.githubMetrics}><div><strong>{inventory.repositories.length}</strong><span>Visible repositories</span></div><div><strong>{registered}</strong><span>Registered assets</span></div><div><strong>{inventory.repositories.length - registered}</strong><span>Awaiting registration</span></div></div>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Search GitHub repositories" placeholder="Search repositories or languages…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.repoGrid}>{repositories.map((repo) => <a href={repo.href} target="_blank" rel="noreferrer" key={repo.id}><span className={styles.repoIcon} aria-hidden="true">⌘</span><div><strong>{repo.name}</strong><p>{repo.description || "No repository description"}</p><small>{titleCase(repo.visibility)} · {repo.language || "Language not detected"} · {repo.defaultBranch}</small></div><i>{repo.registeredAssetId ? "Registered" : "New"}</i></a>)}</div>
    </>}
  </section>;
}

const sensitivityChoices = [
  { value: "standard", label: "Internal", description: "Ordinary company information." },
  { value: "sensitive", label: "Personal data", description: "Customer, supplier or employee details." },
  { value: "restricted", label: "Highly sensitive", description: "Passport, payment, health, login or secret information." },
] as const;

function RegistrationDialog({ assetKind, people, inventory, onClose, onRegistered }: { assetKind: AssetKind; people: readonly ActiveCovePerson[]; inventory: GitHubRepositoryInventory; onClose: () => void; onRegistered: (message: string) => void }) {
  const label = assetKind === "website" ? "website" : "application";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [accessMode, setAccessMode] = useState<"all" | "selected">("selected");
  const [risk, setRisk] = useState<ManagedAsset["risk"]>("standard");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [productionUrl, setProductionUrl] = useState("");
  const [notice, setNotice] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const availableRepositories = inventory.repositories.filter((repo) => repo.visibility === "private" && !repo.archived && !repo.registeredAssetId);

  function chooseOwner(userId: string) {
    setOwner(userId);
    setMembers((current) => current.filter((id) => id !== userId));
  }
  function toggleMember(userId: string) {
    setMembers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(undefined);
    startTransition(async () => {
      const result = await registerExistingAsset({ name, assetKind, description, productOwnerUserId: owner, teamMemberUserIds: members, employeeAccessPolicy: assetKind === "application" ? accessMode : "selected", risk, repositoryUrl, productionUrl, requestId: crypto.randomUUID() });
      if (!result.ok) return setNotice(result.message);
      onRegistered(result.message);
    });
  }

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="registration-title">
      <header><div><span className={styles.kicker}>Existing {label}</span><h2 id="registration-title">Register in SuperPanel</h2><p>Add the live production address now. GitHub can be connected later.</p></div><button type="button" aria-label="Close registration" onClick={onClose} disabled={isPending}>×</button></header>
      <form onSubmit={submit}>
        <section><div className={styles.step}><span>01</span><div><h3>{titleCase(label)}</h3><p>What it is and who owns it.</p></div></div><div className={styles.fields}><label><span>Name</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder={assetKind === "website" ? "e.g. Leatherback Travel" : "e.g. Supplier Reporting"} /></label><label><span>Product owner</span><select required value={owner} onChange={(event) => chooseOwner(event.target.value)}><option value="">Choose an approved Cove person</option>{people.map((person) => <option value={person.userId} key={person.userId}>{person.displayName}{person.status === "invited" ? " — invited" : ""}</option>)}</select><small>{assetKind === "application" ? "Receives Admin access. Invited people can be selected before first sign-in." : "Accountable for the website. Invited people can be selected now."}</small></label><label className={styles.wide}><span>Description</span><textarea required minLength={5} maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label></div></section>
        <section><div className={styles.step}><span>02</span><div><h3>{assetKind === "application" ? "Cove access" : "Working team"}</h3><p>{assetKind === "application" ? "Choose who can open this application." : "Select everyone actively involved."}</p></div></div>{assetKind === "application" ? <div className={styles.accessSelection}><fieldset className={styles.accessChoices}><legend className={styles.srOnly}>Initial Cove access</legend><label className={accessMode === "all" ? styles.accessChoiceSelected : ""}><input type="radio" name="access-mode" checked={accessMode === "all"} onChange={() => setAccessMode("all")} /><i /><span><strong>Enable for all users</strong><small>Everyone approved now or added later receives User access.</small></span></label><label className={accessMode === "selected" ? styles.accessChoiceSelected : ""}><input type="radio" name="access-mode" checked={accessMode === "selected"} onChange={() => setAccessMode("selected")} /><i /><span><strong>Enable for selected users</strong><small>Only the people you choose receive User access.</small></span></label></fieldset>{accessMode === "all" ? <div className={styles.allAccessSummary}><span>✓</span><div><strong>All current and future users</strong><small>{people.length} people receive access now. New Cove users will be added automatically.</small></div></div> : <fieldset className={styles.peoplePicker}><legend>Selected users <b>{members.length} selected</b></legend><div>{people.map((person) => { const isOwner = person.userId === owner; const invitation = person.status === "invited" ? "Invited · access starts after Google sign-in" : person.verifiedEmail; return <label className={members.includes(person.userId) ? styles.personSelected : ""} key={person.userId}><input type="checkbox" checked={members.includes(person.userId)} disabled={isOwner} onChange={() => toggleMember(person.userId)} /><span>{person.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{person.displayName}</strong><small>{isOwner ? `Product owner${person.status === "invited" ? " · invited" : ""}` : invitation}</small></div><i>{isOwner ? "★" : members.includes(person.userId) ? "✓" : "+"}</i></label>; })}</div></fieldset>}</div> : <fieldset className={styles.peoplePicker}><legend>Team members <b>{members.length} selected</b></legend><div>{people.map((person) => { const isOwner = person.userId === owner; const invitation = person.status === "invited" ? "Invited · access starts after Google sign-in" : person.verifiedEmail; return <label className={members.includes(person.userId) ? styles.personSelected : ""} key={person.userId}><input type="checkbox" checked={members.includes(person.userId)} disabled={isOwner} onChange={() => toggleMember(person.userId)} /><span>{person.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{person.displayName}</strong><small>{isOwner ? `Product owner${person.status === "invited" ? " · invited" : ""}` : invitation}</small></div><i>{isOwner ? "★" : members.includes(person.userId) ? "✓" : "+"}</i></label>; })}</div></fieldset>}</section>
        <section><div className={styles.step}><span>03</span><div><h3>Data sensitivity</h3><p>Choose the most sensitive information handled.</p></div></div><fieldset className={styles.choiceGrid}><legend className={styles.srOnly}>Data sensitivity</legend>{sensitivityChoices.map((choice) => <label className={risk === choice.value ? styles.choiceSelected : ""} key={choice.value}><input type="radio" name="risk" checked={risk === choice.value} onChange={() => setRisk(choice.value)} /><i /><strong>{choice.label}</strong><span>{choice.description}</span></label>)}</fieldset></section>
        <section><div className={styles.step}><span>04</span><div><h3>Existing connections</h3><p>Add the live production address now; GitHub is optional.</p></div></div><div className={styles.fields}><label><span>Private GitHub URL <i>Optional</i></span><input type="url" list="private-repositories" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="Leave blank if it is not on GitHub" /><datalist id="private-repositories">{availableRepositories.map((repo) => <option value={repo.href} key={repo.id}>{repo.name}</option>)}</datalist><small>SuperPanel will show a beginner publishing step if blank.</small></label><label><span>Production URL</span><input required type="url" value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} placeholder="https://app.leatherbacktravel.com" /></label></div></section>
        {assetKind === "application" && <p className={styles.accessRule}><strong>Cove access:</strong> the product owner receives Admin and {accessMode === "all" ? "every current and future Cove user receives User automatically" : "the selected people receive User"}. Further individual changes belong in Cove Admin.</p>}
        {notice && <p className={styles.error} role="alert">{notice}</p>}
        <footer><button className={styles.secondary} type="button" onClick={onClose} disabled={isPending}>Cancel</button><button className={styles.primary} type="submit" disabled={isPending || people.length === 0}>{isPending ? "Registering…" : `Register ${label}`}</button></footer>
      </form>
    </section>
  </div>;
}

function AssetEditDialog({ asset, people, inventory, onClose, onUpdated }: {
  asset: ManagedAsset;
  people: readonly ActiveCovePerson[];
  inventory: GitHubRepositoryInventory;
  onClose: () => void;
  onUpdated: (message: string) => void;
}) {
  const label = asset.assetKind === "website" ? "website" : "application";
  const [name, setName] = useState(asset.name);
  const [description, setDescription] = useState(asset.description);
  const [owner, setOwner] = useState(asset.productOwnerUserId ?? "");
  const [members, setMembers] = useState<string[]>([...asset.memberUserIds]);
  const [accessMode, setAccessMode] = useState<"all" | "selected">(asset.employeeAccessPolicy);
  const [risk, setRisk] = useState<ManagedAsset["risk"]>(asset.risk);
  const [status, setStatus] = useState<ManagedAsset["status"]>(asset.status);
  const [repositoryUrl, setRepositoryUrl] = useState(asset.repository?.href ?? "");
  const [productionUrl, setProductionUrl] = useState(asset.productionUrl);
  const [notice, setNotice] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const availableRepositories = inventory.repositories.filter((repo) => repo.visibility === "private" && !repo.archived && (!repo.registeredAssetId || repo.registeredAssetId === asset.id));

  function chooseOwner(userId: string) {
    setOwner(userId);
    setMembers((current) => current.filter((id) => id !== userId));
  }

  function toggleMember(userId: string) {
    setMembers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(undefined);
    startTransition(async () => {
      const result = await updateManagedAsset({
        assetId: asset.id,
        name,
        description,
        productOwnerUserId: owner,
        teamMemberUserIds: members,
        employeeAccessPolicy: asset.assetKind === "application" ? accessMode : "selected",
        risk,
        status,
        repositoryUrl,
        productionUrl,
        requestId: crypto.randomUUID(),
      });
      if (!result.ok) return setNotice(result.message);
      onUpdated(result.message);
    });
  }

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="asset-edit-title">
      <header><div><span className={styles.kicker}>{titleCase(label)} profile</span><h2 id="asset-edit-title">Edit {asset.name}</h2><p>Keep ownership, delivery responsibility and production links current.</p></div><button type="button" aria-label="Close profile editor" onClick={onClose} disabled={isPending}>×</button></header>
      <form onSubmit={submit}>
        <section><div className={styles.step}><span>01</span><div><h3>Profile</h3><p>What this {label} is and who owns it.</p></div></div><div className={styles.fields}><label><span>Name</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Product owner</span><select required value={owner} onChange={(event) => chooseOwner(event.target.value)}><option value="">Choose an approved Cove person</option>{people.map((person) => <option value={person.userId} key={person.userId}>{person.displayName}{person.status === "invited" ? " — invited" : ""}</option>)}</select><small>Invited people can be assigned before their first sign-in.</small></label><label className={styles.wide}><span>Description</span><textarea required minLength={5} maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label></div></section>
        <section><div className={styles.step}><span>02</span><div><h3>Delivery team</h3><p>People actively improving or maintaining it.</p></div></div><fieldset className={styles.peoplePicker}><legend>Team members <b>{members.length} selected</b></legend><div>{people.map((person) => { const isOwner = person.userId === owner; const invitation = person.status === "invited" ? "Invited · access starts after Google sign-in" : person.verifiedEmail; return <label className={members.includes(person.userId) ? styles.personSelected : ""} key={person.userId}><input type="checkbox" checked={members.includes(person.userId)} disabled={isOwner} onChange={() => toggleMember(person.userId)} /><span>{person.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{person.displayName}</strong><small>{isOwner ? `Product owner${person.status === "invited" ? " · invited" : ""}` : invitation}</small></div><i>{isOwner ? "★" : members.includes(person.userId) ? "✓" : "+"}</i></label>; })}</div><small className={styles.pickerNote}>This records delivery responsibility. Cove access and private GitHub access are assigned separately.</small></fieldset></section>
        {asset.assetKind === "application" && <section><div className={styles.step}><span>03</span><div><h3>Cove access</h3><p>Set the lasting access rule for this application.</p></div></div><div className={styles.accessSelection}><fieldset className={styles.accessChoices}><legend className={styles.srOnly}>Cove access policy</legend><label className={accessMode === "all" ? styles.accessChoiceSelected : ""}><input type="radio" name="edit-access-mode" checked={accessMode === "all"} onChange={() => setAccessMode("all")} /><i /><span><strong>Enable for all users</strong><small>Every current and future Cove user receives User access automatically.</small></span></label><label className={accessMode === "selected" ? styles.accessChoiceSelected : ""}><input type="radio" name="edit-access-mode" checked={accessMode === "selected"} onChange={() => setAccessMode("selected")} /><i /><span><strong>Enable for selected users</strong><small>Individual User and Admin grants are managed in Cove Admin.</small></span></label></fieldset><p className={styles.policyTransitionNote}>{accessMode === "all" ? "Saving will add any current users who do not already have access." : "Automatic future grants will stop. Existing access is kept until deliberately changed in Cove Admin."}</p></div></section>}
        <section><div className={styles.step}><span>{asset.assetKind === "application" ? "04" : "03"}</span><div><h3>Governance</h3><p>Sensitivity and operating state.</p></div></div><div className={styles.governanceFields}><fieldset className={styles.choiceGrid}><legend className={styles.srOnly}>Data sensitivity</legend>{sensitivityChoices.map((choice) => <label className={risk === choice.value ? styles.choiceSelected : ""} key={choice.value}><input type="radio" name="risk" checked={risk === choice.value} onChange={() => setRisk(choice.value)} /><i /><strong>{choice.label}</strong><span>{choice.description}</span></label>)}</fieldset><label><span>Operating status</span><select value={status} onChange={(event) => setStatus(event.target.value as ManagedAsset["status"])}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></label></div></section>
        <section><div className={styles.step}><span>{asset.assetKind === "application" ? "05" : "04"}</span><div><h3>Production & source</h3><p>Where the live product and code live.</p></div></div><div className={styles.fields}><label><span>Private GitHub URL <i>Optional</i></span><input type="url" list={`private-repositories-${asset.id}`} value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/leatherback-travel-organisation/…" /><datalist id={`private-repositories-${asset.id}`}>{availableRepositories.map((repo) => <option value={repo.href} key={repo.id}>{repo.name}</option>)}</datalist></label><label><span>Production URL</span><input required type="url" value={productionUrl} onChange={(event) => setProductionUrl(event.target.value)} /></label></div></section>
        {notice && <p className={styles.error} role="alert">{notice}</p>}
        <footer><button className={styles.secondary} type="button" onClick={onClose} disabled={isPending}>Cancel</button><button className={styles.primary} type="submit" disabled={isPending || people.length === 0}>{isPending ? "Saving…" : "Save profile"}</button></footer>
      </form>
    </section>
  </div>;
}

function SsoIntegrationPanel({ asset, integration, automationEnabled, onChanged }: { asset: ManagedAsset; integration?: CoveSsoIntegration; automationEnabled: boolean; onChanged: (message: string) => void }) {
  const router = useRouter();
  const state = integration?.state ?? "not_configured";
  const presentation = COVE_SSO_STATE_PRESENTATION[state];
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [isPending, startTransition] = useTransition();
  const action = state === "ready_for_approval" ? "approve" : state === "checks_running" || state === "active" ? "refresh" : "prepare";
  const buttonLabel = action === "approve" ? "Approve merge & activation" : action === "refresh" ? state === "active" ? "Refresh production evidence" : "Refresh checks" : state === "needs_attention" ? "Retry automatic setup" : "Prepare SSO changes";

  function run() {
    if (action === "approve" && !window.confirm("Approve this reviewed change? Cove will move the draft pull request forward, merge it, and allow Vercel to deploy. The application will remain inactive until real production evidence passes.")) return;
    setMessage(undefined);
    startTransition(async () => {
      const request = { assetId: asset.id, requestId: crypto.randomUUID() };
      const result = action === "approve" ? await approveApplicationSso(request) : action === "refresh" ? await refreshApplicationSso(request) : await prepareApplicationSso(request);
      setMessage({ text: result.message, error: !result.ok });
      router.refresh();
      if (result.ok) onChanged(result.message);
    });
  }

  return <section className={styles.ssoPanel} data-state={state}>
    <span className={styles.kicker}>Cove shared sign-in</span>
    <div className={styles.ssoHeading}><div><h3>{presentation.label}</h3><p>{presentation.description}</p></div><strong>{integration?.kitVersion ? `Kit v${integration.kitVersion}` : "Setup not started"}</strong></div>
    {integration?.lastError && <p className={styles.ssoAttention} role="alert"><strong>What needs attention</strong>{integration.lastError}</p>}
    {integration?.githubPullRequestUrl && <a className={styles.ssoPullRequest} href={integration.githubPullRequestUrl} target="_blank" rel="noreferrer">Open prepared GitHub pull request #{integration.githubPullRequestNumber} ↗</a>}
    {integration?.evidence.length ? <div className={styles.ssoEvidence}>{integration.evidence.map((item) => <article data-status={item.status} key={item.key}><span>{item.status === "passed" ? "✓" : item.status === "running" || item.status === "pending" ? "…" : "!"}</span><div><strong>{titleCase(item.key)}</strong><p>{item.summary}</p><small>{item.source}</small></div></article>)}</div> : <p className={styles.ssoEmpty}>Cove will validate the canonical User/Admin roles, Clerk satellite domain, private GitHub change, Vercel settings, automated checks, and live production evidence.</p>}
    {message && <p className={styles.ssoMessage} role={message.error ? "alert" : "status"} data-error={message.error}>{message.text}</p>}
    <div className={styles.ssoActions}><button className={action === "approve" ? styles.primary : styles.secondary} type="button" disabled={isPending || !automationEnabled} onClick={run}>{isPending ? "Working…" : automationEnabled ? buttonLabel : "Migration actions paused"}</button>{!automationEnabled ? <small>The audit is live. Application changes stay paused until Cove supports legacy-login-safe integration and genuine production sign-in verification.</small> : state === "ready_for_approval" ? <small>This is the required Admin checkpoint. Nothing is merged or deployed before this action.</small> : null}</div>
  </section>;
}

function AssetDetail({ record, people, inventory, ssoAutomationEnabled, onClose, onUpdated }: { record: AssetRecord; people: readonly ActiveCovePerson[]; inventory: GitHubRepositoryInventory; ssoAutomationEnabled: boolean; onClose: () => void; onUpdated: (message: string) => void }) {
  const { asset, telemetry, hygiene, access } = record;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const owner = people.find((person) => person.userId === asset.productOwnerUserId);
  const members = people.filter((person) => asset.memberUserIds.includes(person.userId));
  const prompt = asset.repository
    ? `Help me improve ${asset.name} in ${asset.repository.path}. First read the repository instructions and README, then install the locked dependencies and run the existing quality checks. Make the requested change on a new branch, keep secrets and .env files out of Git, add or update tests, and open a pull request through my own GitHub identity. Do not deploy directly or bypass required review.`
    : `Publish this existing ${asset.assetKind} to the private company repository provided by the systems owner. Work from the complete source folder. Before pushing: verify the production build; remove secrets, .env files, credentials, generated build folders and local caches; keep the source, lockfile, README and an .env.example containing variable names only. Initialise Git if needed, commit the reviewed source on a branch, push through my own GitHub identity, and open a pull request. Never request or use a shared company password or token.`;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editing) setEditing(false);
      else onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editing, onClose]);
  return <div className={styles.detailBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={styles.detail} role="dialog" aria-modal="true" aria-label={`${asset.name} details`}>
      <header><div className={styles.detailHeaderActions}><button className={styles.editProfile} type="button" onClick={() => setEditing(true)}>Edit profile</button><button type="button" aria-label="Close asset details" onClick={onClose}>×</button></div><span>{mark(asset)}</span><div><small>{titleCase(asset.assetKind)} profile</small><h2>{asset.name}</h2><p>{asset.description}</p></div></header>
      <div className={styles.detailBody}>
      <section><span className={styles.kicker}>Governance</span><h3>Ownership & operations</h3><dl><div><dt>Product owner</dt><dd>{owner?.displayName ?? asset.productOwnerName}</dd></div><div><dt>Status</dt><dd>{titleCase(asset.status)}</dd></div><div><dt>Data</dt><dd>{sensitivityLabel(asset.risk)}</dd></div><div><dt>Asset ID</dt><dd><code>{asset.slug}</code></dd></div></dl></section>
      {asset.assetKind === "application" && <SsoIntegrationPanel asset={asset} integration={record.sso} automationEnabled={ssoAutomationEnabled} onChanged={onUpdated} />}
      <section className={styles.publish}><span className={styles.kicker}>Contributor setup</span><h3>{asset.repository ? "Get a teammate improving this app" : "Connect this project to company GitHub"}</h3><p>{asset.repository ? "Cove records who is responsible; GitHub, local configuration and the coding AI each need their own access." : "Create the private repository before a teammate can work safely with Claude Code or Codex."}</p><ol><li><span>1</span><div><strong>{asset.repository ? "Grant named GitHub access" : "Systems owner creates the private repository"}</strong><small>{asset.repository ? `Add the teammate to ${asset.repository.path} through the responsible GitHub team with Write access.` : "Member repository creation stays disabled; contributors receive access only to this project."}</small></div></li><li><span>2</span><div><strong>Share development configuration securely</strong><small>Give the teammate required environment values through the company password manager. Never send or commit an .env file.</small></div></li><li><span>3</span><div><strong>Use their own AI and GitHub identity</strong><small>They clone the repository, sign in to Codex or Claude Code themselves, and work on a branch.</small></div></li><li><span>4</span><div><strong>Start with the guarded instruction</strong><code>{prompt}</code><button type="button" onClick={async () => { await navigator.clipboard.writeText(prompt); setCopied(true); }}>{copied ? "Copied" : "Copy instruction"}</button></div></li></ol></section>
      {hygiene && <section><span className={styles.kicker}>Automated hygiene</span><h3>{hygiene.state === "ready" ? "Ready" : hygiene.state === "needs_work" ? "Action required" : "Evidence incomplete"}</h3><small>Checked {dateLabel(hygiene.checkedAt)}</small><div className={styles.checks}>{hygiene.checks.map((check) => <article data-status={check.status} key={check.key}><span>{check.status === "passed" ? "✓" : check.status === "failed" ? "!" : "?"}</span><div><strong>{check.label}</strong><p>{check.evidence}</p><small>Assigned to {check.owner}</small></div></article>)}</div></section>}
      <section><span className={styles.kicker}>Delivery team</span><h3>{members.length} team {members.length === 1 ? "member" : "members"}</h3><p>These are the people recorded as actively improving or maintaining this {asset.assetKind}.</p><div className={styles.accessList}>{members.map((person) => <article key={person.userId}><div><strong>{person.displayName}</strong><small>{person.verifiedEmail}</small></div><i>Delivery</i></article>)}{!members.length && <p>No delivery team members are recorded yet.</p>}</div></section>
      {asset.assetKind === "application" && <section><span className={styles.kicker}>Cove access</span><h3>{access?.adminCount ?? 0} Admin · {access?.userCount ?? 0} User</h3><p>Cove access lets people open, test and give product feedback. It does not let them change the source; GitHub access is assigned separately.</p><div className={styles.accessList}>{access?.users.map((user) => <article key={user.userId}><div><strong>{user.displayName}</strong><small>{user.verifiedEmail}</small></div><i>{titleCase(user.level)}</i></article>)}{!access?.users.length && <p>No active access grants are shown.</p>}</div><Link href="/admin">Manage access in Cove Admin</Link></section>}
      <section><span className={styles.kicker}>Environment</span><h3>Production & source</h3><div className={styles.resources}><a href={asset.productionUrl} target="_blank" rel="noreferrer"><span>↗</span><div><small>Production site</small><strong>{new URL(asset.productionUrl).hostname}</strong></div><i>Open</i></a>{asset.repository && <a href={asset.repository.href} target="_blank" rel="noreferrer"><span>⌘</span><div><small>Private GitHub source</small><strong>{asset.repository.path}</strong></div><i>Open</i></a>}</div><div className={integrationReady(telemetry.github.state) ? styles.integrationGood : styles.integrationPending}><span>{integrationReady(telemetry.github.state) ? "✓" : "!"}</span><div><strong>GitHub {titleCase(telemetry.github.state)}</strong><p>{telemetry.github.message}</p></div></div></section>
      </div>
    </aside>
    {editing && <AssetEditDialog asset={asset} people={people} inventory={inventory} onClose={() => setEditing(false)} onUpdated={(message) => { setEditing(false); onUpdated(message); }} />}
  </div>;
}

export function SystemsManager({ assetKind, assets, people, accessSummaries, telemetry, repositoryInventory, hygiene, ssoIntegrations, ssoAutomationEnabled }: { assetKind: AssetKind; assets: readonly ManagedAsset[]; people: readonly ActiveCovePerson[]; accessSummaries: readonly ApplicationAccessSummary[]; telemetry: readonly AssetTelemetry[]; repositoryInventory: GitHubRepositoryInventory; hygiene: readonly AssetHygiene[]; ssoIntegrations: readonly CoveSsoIntegration[]; ssoAutomationEnabled: boolean }) {
  const router = useRouter();
  const records = useMemo(() => assets.filter((asset) => asset.assetKind === assetKind).map((asset) => ({
    asset,
    telemetry: telemetry.find((item) => item.assetId === asset.id) ?? { assetId: asset.id, github: { state: "unavailable", message: "GitHub evidence was not loaded." }, deployments: { state: "unavailable", message: "Deployment evidence was not loaded." } },
    hygiene: hygiene.find((item) => item.assetId === asset.id),
    access: asset.applicationId ? accessSummaries.find((item) => item.applicationId === asset.applicationId) : undefined,
    sso: ssoIntegrations.find((item) => item.managedAssetId === asset.id),
  })), [accessSummaries, assetKind, assets, hygiene, ssoIntegrations, telemetry]);
  const [query, setQuery] = useState("");
  const [needsWork, setNeedsWork] = useState(false);
  const [harmonisationFilter, setHarmonisationFilter] = useState<HarmonisationBucket | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);
  const [notice, setNotice] = useState<string>();
  const visible = records.filter((record) => {
    const matches = `${record.asset.name} ${record.asset.description} ${record.asset.productOwnerName}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesHarmonisation = assetKind !== "application" || harmonisationFilter === "all" || harmonisationBucket(record) === harmonisationFilter;
    return matches && matchesHarmonisation && (!needsWork || recordStatus(record).pending);
  });
  const selected = records.find((record) => record.asset.id === selectedId);
  const workCount = records.filter((record) => recordStatus(record).pending).length;
  const plural = assetKind === "website" ? "websites" : "applications";
  return <div className={styles.workspace}>
    <SystemsHeader assetKind={assetKind} total={records.length} needsWork={workCount} onRegister={() => setShowRegistration(true)} />
    {notice && <p className={styles.notice} role="status">✓ {notice}<button type="button" onClick={() => setNotice(undefined)} aria-label="Dismiss message">×</button></p>}
    {assetKind === "application" && <HarmonisationOverview records={records} filter={harmonisationFilter} onFilter={setHarmonisationFilter} />}
    <RepositoryInventory inventory={repositoryInventory} />
    <div className={styles.layout}>
      <section className={styles.registry} aria-labelledby="asset-registry-title">
        <div className={styles.registryToolbar}>
          <div className={styles.registryTitle}><span className={styles.kicker}>{titleCase(assetKind)} portfolio</span><h2 id="asset-registry-title">Registered {plural}</h2></div>
          <label className={styles.search}><span>⌕</span><input type="search" aria-label={`Search ${plural}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${plural} or owners…`} /></label>
          <button className={styles.workFilter} type="button" aria-pressed={needsWork} onClick={() => setNeedsWork((current) => !current)}>! Needs work</button>
          <span className={styles.recordCount}>{visible.length} of {records.length}</span>
        </div>
        <div className={styles.assetList}>
          <div className={styles.listHead}><span>{titleCase(assetKind)}</span><span>Owner</span><span>{assetKind === "application" ? "Access" : "Team"}</span><span>Data</span><span>Source</span><span>Production</span><span>{assetKind === "application" ? "Cove harmonisation" : "Hygiene"}</span><span /></div>
          {visible.map((record) => {
            const status = recordStatus(record);
            const teamSize = record.asset.assetKind === "application" ? (record.access?.users.length ?? 0) : record.asset.memberUserIds.length + (record.asset.productOwnerUserId ? 1 : 0);
            return <button type="button" className={selectedId === record.asset.id ? styles.selectedRow : ""} key={record.asset.id} onClick={() => setSelectedId(record.asset.id)} aria-expanded={selectedId === record.asset.id}>
              <span className={styles.identity}><i>{mark(record.asset)}</i><span><strong>{record.asset.name}</strong><small>{record.asset.description}</small></span></span>
              <span><strong>{record.asset.productOwnerName}</strong><small>{record.asset.productOwnerUserId ? "Accountable owner" : "Owner required"}</small></span>
              <span><strong>{teamSize} {teamSize === 1 ? "person" : "people"}</strong><small>{record.asset.assetKind === "application" ? record.asset.employeeAccessPolicy === "all" ? "All users" : "Selected users" : "Working team"}</small></span>
              <span><strong>{sensitivityLabel(record.asset.risk)}</strong><small>{titleCase(record.asset.status)}</small></span>
              <span className={record.asset.repository ? styles.compactReady : styles.compactPending}><strong>{record.asset.repository ? "Connected" : "Not connected"}</strong><small>{record.asset.repository?.path ?? "GitHub required"}</small></span>
              <span className={integrationReady(record.telemetry.deployments.state) ? styles.compactReady : styles.compactPending}><strong>{hostname(record.asset.productionUrl)}</strong><small>{titleCase(record.telemetry.deployments.state)}</small></span>
              <span className={status.pending ? styles.compactPending : styles.compactReady}><strong>{status.label}</strong><small>{status.detail}</small></span>
              <span className={styles.rowArrow}>›</span>
            </button>;
          })}
          {visible.length === 0 && <p className={styles.empty}>No {plural} match this filter.</p>}
        </div>
      </section>
    </div>
    {selected && <AssetDetail record={selected} people={people} inventory={repositoryInventory} ssoAutomationEnabled={ssoAutomationEnabled} onClose={() => setSelectedId(null)} onUpdated={(message) => { setNotice(message); router.refresh(); }} />}
    {showRegistration && <RegistrationDialog assetKind={assetKind} people={people} inventory={repositoryInventory} onClose={() => setShowRegistration(false)} onRegistered={(message) => { setShowRegistration(false); setNotice(message); router.refresh(); }} />}
  </div>;
}
