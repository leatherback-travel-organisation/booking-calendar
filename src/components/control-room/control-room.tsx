"use client";

import { useMemo, useState } from "react";
import styles from "./control-room.module.css";

type AgenticView = "today" | "approvals" | "rehearsal";
type SystemsView = "activity" | "recovery";
type RestoreStep = "closed" | "scope" | "isolated" | "evidence";

const approvals = [
  {
    id: "seo-brief",
    agent: "Signal Scout",
    title: "Prepare three on-page SEO briefs",
    detail: "Read-only crawl of public brand pages, followed by draft briefs. No publishing.",
    permission: "Public web read · Draft creation",
    risk: "Low",
  },
  {
    id: "review-match",
    agent: "Review Keeper",
    title: "Queue four uncertain guest matches",
    detail: "Four Google reviews could not be matched confidently. Human confirmation is required before Airtable changes.",
    permission: "Airtable guest update",
    risk: "Customer data",
  },
  {
    id: "content-plan",
    agent: "Answer Engine",
    title: "Draft Patch answer-engine plan",
    detail: "Build a source-backed content plan. External publishing remains locked.",
    permission: "Public web read · Draft creation",
    risk: "Low",
  },
] as const;

const sessions = [
  { app: "TRTL", person: "Operations team", last: "12 min ago", window: "09:18–10:04", state: "Active", colour: "coral" },
  { app: "Money", person: "Finance team", last: "48 min ago", window: "08:42–09:28", state: "Recent", colour: "gold" },
  { app: "Recruitment", person: "People team", last: "Yesterday", window: "16:02–16:31", state: "Ended", colour: "blue" },
  { app: "Systems", person: "Systems operator", last: "Now", window: "10:14–now", state: "Active", colour: "mint" },
] as const;

const rehearsalDays = [
  { date: "08", day: "Sat", title: "Capture", detail: "Speak five requests into the inbox; verify every transcript before it becomes a proposal." },
  { date: "09", day: "Sun", title: "Triage", detail: "Sort the morning brief using voice-only commands and reject one deliberately risky action." },
  { date: "10", day: "Mon", title: "Delegate", detail: "Launch two read-only research runs and inspect their evidence cards." },
  { date: "11", day: "Tue", title: "Approve", detail: "Approve a reversible draft and confirm that publishing remains locked." },
  { date: "12", day: "Wed", title: "Interrupt", detail: "Stop a running agent, change its scope and resume from the recorded checkpoint." },
  { date: "13", day: "Thu", title: "Recover", detail: "Complete an isolated restore drill and compare checksums and row counts." },
  { date: "14", day: "Fri", title: "Run the day", detail: "Use only the daily brief, voice inbox and approval queue until lunch." },
  { date: "15", day: "Sat", title: "Go / no-go", detail: "Review misses, permissions and recovery evidence; decide which capabilities can graduate." },
] as const;

const agenticNav: readonly { id: AgenticView; label: string; count?: number }[] = [
  { id: "today", label: "Today" },
  { id: "approvals", label: "Approval gate", count: approvals.length },
  { id: "rehearsal", label: "Aug 8–15" },
];

const systemsNav: readonly { id: SystemsView; label: string }[] = [
  { id: "activity", label: "Session activity" },
  { id: "recovery", label: "Backup engine" },
];

function StatusPill({ state }: { state: "ready" | "setup" | "rehearsal" }) {
  const label = state === "ready" ? "Ready" : state === "setup" ? "Setup needed" : "Rehearsal only";
  return <span className={styles.statusPill} data-state={state}><i />{label}</span>;
}

function TodayView({ operatorName, openView }: { operatorName: string; openView: (view: AgenticView) => void }) {
  const firstName = operatorName.trim().split(/\s+/)[0] || "Operator";
  return <div className={styles.todayGrid}>
    <section className={styles.briefCard}>
      <div className={styles.cardEyebrow}><span>19 July · Sunday</span><StatusPill state="rehearsal" /></div>
      <h2>Good morning, {firstName}.</h2>
      <p className={styles.briefLead}>The company is quiet. Three decisions are waiting; nothing is blocked and no agent has permission to publish.</p>
      <div className={styles.briefStats}>
        <button onClick={() => openView("approvals")}><strong>03</strong><span>decisions waiting</span><i>Review →</i></button>
        <button onClick={() => openView("rehearsal")}><strong>08</strong><span>rehearsal days</span><i>Prepare →</i></button>
        <button onClick={() => openView("approvals")}><strong>04</strong><span>agent capabilities</span><i>Review →</i></button>
      </div>
      <div className={styles.briefNarrative}>
        <span aria-hidden="true">◎</span>
        <div><strong>Your 45-second brief</strong><p>Review Keeper needs four guest matches checked. Signal Scout can prepare SEO briefs without publishing. Backup storage and the voice connector still need configuration.</p></div>
        <button type="button" aria-label="Audio briefing unavailable" title="Voice output is not configured">Listen</button>
      </div>
    </section>

    <section className={styles.voiceCard}>
      <div className={styles.cardEyebrow}><span>Voice inbox</span><StatusPill state="setup" /></div>
      <div className={styles.voiceOrb} aria-hidden="true"><i /><i /><i /><span>⌁</span></div>
      <h3>Say it. Check it. Then send it.</h3>
      <p>A connected speech service will turn a voice note into an editable proposal. It will never execute directly from a transcript.</p>
      <button type="button" disabled>Connect speech service</button>
      <small>No microphone audio is being captured or stored.</small>
    </section>

    <section className={styles.runwayCard}>
      <header><div><span className={styles.kicker}>Active swarm</span><h3>Four bots, zero loose cannons</h3></div><button type="button" onClick={() => openView("approvals")}>Open gate</button></header>
      <div className={styles.botRail}>
        <article><span data-tone="coral">R</span><div><strong>Review Keeper</strong><small>Waiting for identity decisions</small></div><i data-state="waiting">Waiting</i></article>
        <article><span data-tone="mint">S</span><div><strong>Signal Scout</strong><small>Public research permission</small></div><i>Ready</i></article>
        <article><span data-tone="gold">A</span><div><strong>Answer Engine</strong><small>Draft-only permission</small></div><i>Ready</i></article>
        <article><span data-tone="blue">B</span><div><strong>Backup Steward</strong><small>Storage not connected</small></div><i data-state="setup">Setup</i></article>
      </div>
    </section>

    <section className={styles.connectorCard}>
      <div className={styles.cardEyebrow}><span>Connector readiness</span><span className={styles.fraction}>2 / 5</span></div>
      <div className={styles.connectorList}>
        <div><span>Ai</span><strong>Airtable</strong><i data-ready="true">Connected</i></div>
        <div><span>V</span><strong>Vercel</strong><i data-ready="true">Connected</i></div>
        <div><span>G</span><strong>Google Reviews</strong><i>Needs OAuth</i></div>
        <div><span>◉</span><strong>Backup storage</strong><i>Choose vault</i></div>
        <div><span>≈</span><strong>Speech service</strong><i>Choose provider</i></div>
      </div>
    </section>
  </div>;
}

function ApprovalView() {
  const [selected, setSelected] = useState<(typeof approvals)[number]["id"]>(approvals[0].id);
  const item = approvals.find((approval) => approval.id === selected) ?? approvals[0];
  return <div className={styles.approvalLayout}>
    <section className={styles.queuePanel}>
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>Human authority</span><h2>Approval gate</h2><p>Proposals wait here before anything changes outside the control room.</p></div><strong>{approvals.length}</strong></div>
      <div className={styles.approvalList}>{approvals.map((approval, index) => <button key={approval.id} type="button" data-selected={approval.id === selected} onClick={() => setSelected(approval.id)}><span>0{index + 1}</span><div><small>{approval.agent}</small><strong>{approval.title}</strong><p>{approval.permission}</p></div><i>›</i></button>)}</div>
    </section>
    <aside className={styles.approvalDetail}>
      <div className={styles.cardEyebrow}><span>Decision preview</span><StatusPill state="rehearsal" /></div>
      <span className={styles.approvalMark}>{item.agent.slice(0, 1)}</span>
      <small>{item.agent} proposes</small><h3>{item.title}</h3><p>{item.detail}</p>
      <dl><div><dt>Permission</dt><dd>{item.permission}</dd></div><div><dt>Risk</dt><dd>{item.risk}</dd></div><div><dt>Expires</dt><dd>After one run</dd></div><div><dt>Evidence</dt><dd>Required before completion</dd></div></dl>
      <div className={styles.decisionNotice}><strong>Approval controls are in rehearsal mode.</strong><span>No task will launch and no external system will change.</span></div>
      <div className={styles.decisionButtons}><button type="button" disabled>Reject</button><button type="button" disabled>Approve one run</button></div>
    </aside>
  </div>;
}

function ActivityView() {
  const [range, setRange] = useState("Today");
  return <section className={styles.activityPanel}>
    <div className={styles.sectionHeading}><div><span className={styles.kicker}>Suite pulse</span><h2>Session activity</h2><p>Designed for app-level sessions; currently showing safe preview records until live session telemetry is connected.</p></div><div className={styles.rangePicker}>{["Today", "7 days", "30 days"].map((item) => <button type="button" key={item} data-active={range === item} onClick={() => setRange(item)}>{item}</button>)}</div></div>
    <div className={styles.activitySummary}><article><strong>04</strong><span>sessions shown</span></article><article><strong>02</strong><span>active or recent</span></article><article><strong>4</strong><span>apps represented</span></article><article><strong>Preview</strong><span>data source</span></article></div>
    <div className={styles.sessionTable} role="table" aria-label={`${range} session activity`}>
      <div role="row" className={styles.sessionHead}><span>Application</span><span>Person or team</span><span>Session window</span><span>Last seen</span><span>Status</span></div>
      {sessions.map((session) => <div role="row" key={session.app} className={styles.sessionRow}><span><i data-colour={session.colour}>{session.app.slice(0, 1)}</i><strong>{session.app}</strong></span><span>{session.person}</span><span>{session.window}</span><span>{session.last}</span><span data-status={session.state.toLowerCase()}><i />{session.state}</span></div>)}
    </div>
    <p className={styles.honestyNote}><span>i</span><strong>Connection boundary</strong> Cove records a person’s latest authentication today, but not yet the app/session trail shown by this design. These rows are labelled preview and do not claim production activity.</p>
  </section>;
}

function RestoreDialog({ step, setStep }: { step: RestoreStep; setStep: (step: RestoreStep) => void }) {
  if (step === "closed") return null;
  const index = step === "scope" ? 1 : step === "isolated" ? 2 : 3;
  return <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setStep("closed"); }}>
    <section className={styles.restoreDialog} role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <header><div><span className={styles.kicker}>Zero-impact rehearsal</span><h2 id="restore-title">Restore drill</h2></div><button type="button" onClick={() => setStep("closed")} aria-label="Close restore drill">×</button></header>
      <div className={styles.stepTrack}>{[1, 2, 3].map((item) => <i key={item} data-active={item <= index}>{item}</i>)}</div>
      {step === "scope" && <div className={styles.restoreBody}><span className={styles.restoreGlyph}>◇</span><h3>Choose a recovery scope</h3><p>This rehearsal uses a manifest-shaped preview. No production backup exists yet and no provider call will be made.</p><label><span>Source</span><select defaultValue="cove"><option value="cove">Cove database · configuration preview</option><option value="airtable">Airtable · configuration preview</option></select></label><label><span>Recovery point</span><select defaultValue="latest"><option value="latest">Latest verified artifact · unavailable</option></select></label></div>}
      {step === "isolated" && <div className={styles.restoreBody}><span className={styles.restoreGlyph}>⬡</span><h3>Isolation is mandatory</h3><p>A real drill will create a temporary recovery target with no production credentials, webhooks or outbound automations.</p><ul><li><i>✓</i> Production overwrite prohibited</li><li><i>✓</i> Outbound integrations disabled</li><li><i>✓</i> Temporary target expires automatically</li></ul></div>}
      {step === "evidence" && <div className={styles.restoreBody}><span className={styles.restoreGlyph}>✓</span><h3>Rehearsal complete</h3><p>The safe flow is ready, but backup storage and provider credentials must be connected before integrity evidence can be produced.</p><div className={styles.evidenceGrid}><span><strong>—</strong>checksum</span><span><strong>—</strong>row count</span><span><strong>0</strong>systems changed</span></div></div>}
      <footer><button type="button" onClick={() => setStep(index === 1 ? "closed" : index === 2 ? "scope" : "closed")}>{index === 1 ? "Cancel" : index === 2 ? "Back" : "Close"}</button>{index < 3 && <button type="button" onClick={() => setStep(index === 1 ? "isolated" : "evidence")}>{index === 1 ? "Review isolation" : "Complete rehearsal"}</button>}</footer>
    </section>
  </div>;
}

function RecoveryView() {
  const [restoreStep, setRestoreStep] = useState<RestoreStep>("closed");
  return <>
    <div className={styles.recoveryGrid}>
      <section className={styles.recoveryHero}>
        <div className={styles.cardEyebrow}><span>Recovery posture</span><StatusPill state="setup" /></div>
        <div className={styles.vaultVisual}><span>0</span><i /><i /><i /></div>
        <h2>A beautiful safety net starts with an honest zero.</h2><p>No backup vault is connected, so Cove cannot claim recoverability yet. Configure separate storage, create the first encrypted artifact, then prove it with an isolated restore.</p>
        <div className={styles.recoveryActions}><button type="button" disabled>Back up now</button><button type="button" onClick={() => setRestoreStep("scope")}>Rehearse a restore</button></div>
      </section>
      <section className={styles.coverageCard}><div className={styles.cardEyebrow}><span>Coverage map</span><span>0 / 3 verified</span></div>{[
        ["Cove · Neon", "Point-in-time recovery", "Connect provider"],
        ["Operations · Airtable", "Encrypted export", "Choose tables"],
        ["Audit ledger", "Separate retention", "Choose vault"],
      ].map(([name, method, action], index) => <article key={name}><span>0{index + 1}</span><div><strong>{name}</strong><small>{method}</small></div><i>{action}</i></article>)}</section>
      <section className={styles.safetyCard}><span className={styles.kicker}>Restore doctrine</span><h3>Production is never the first target.</h3><ol><li><span>01</span><p><strong>Verify the artifact</strong>Checksum, encryption and manifest must agree.</p></li><li><span>02</span><p><strong>Restore in isolation</strong>No credentials, messages, webhooks or production traffic.</p></li><li><span>03</span><p><strong>Compare evidence</strong>Schema, counts and critical records receive deterministic checks.</p></li><li><span>04</span><p><strong>Request recovery authority</strong>A production recovery remains a separate, explicit decision.</p></li></ol></section>
      <section className={styles.timelineCard}><div className={styles.cardEyebrow}><span>Recovery history</span><StatusPill state="rehearsal" /></div><div className={styles.emptyTimeline}><span>⌁</span><strong>No evidence yet</strong><p>Real backup and drill events will appear here as an append-only timeline.</p></div></section>
    </div>
    <RestoreDialog step={restoreStep} setStep={setRestoreStep} />
  </>;
}

function RehearsalView() {
  const [selected, setSelected] = useState("08");
  const day = rehearsalDays.find((item) => item.date === selected) ?? rehearsalDays[0];
  return <section className={styles.rehearsalPanel}>
    <div className={styles.rehearsalIntro}><span className={styles.kicker}>Keyboard-free field test</span><h2>Eight days to learn where the magic breaks.</h2><p>August 8–15 is a rehearsal, not a launch. Every day tests one human–agent handoff and records friction before more authority is granted.</p><div><span>Start</span><strong>08.08</strong><i /><span>Decision</span><strong>15.08</strong></div></div>
    <div className={styles.dayStrip}>{rehearsalDays.map((item) => <button key={item.date} type="button" data-selected={selected === item.date} onClick={() => setSelected(item.date)}><small>{item.day}</small><strong>{item.date}</strong><span>{item.title}</span></button>)}</div>
    <div className={styles.dayDetail}><div><span>August {day.date}</span><strong>{day.title}</strong></div><p>{day.detail}</p><ul><li><i />No irreversible writes</li><li><i />Transcript confirmation required</li><li><i />Evidence captured after every run</li></ul><button type="button" disabled>Start guided rehearsal</button><small>Guided voice controls are not connected yet.</small></div>
    <div className={styles.graduationGrid}><article><span>01</span><strong>Trust</strong><p>Did the system say what it knew, what it inferred and what it could not do?</p></article><article><span>02</span><strong>Control</strong><p>Could you interrupt, narrow and reject work without reaching for a keyboard?</p></article><article><span>03</span><strong>Recovery</strong><p>Could every material change be explained, reversed or restored safely?</p></article></div>
  </section>;
}

export function AgenticOsWorkspace({ operatorName }: { operatorName: string }) {
  const [view, setView] = useState<AgenticView>("today");
  const title = useMemo(() => agenticNav.find((item) => item.id === view)?.label ?? "Today", [view]);
  return <div className={`${styles.controlRoom} ${styles.aquaRoom}`}>
    <header className={styles.roomHeader}>
      <div><span className={styles.liveMark}><i />COVE APPLICATION</span><h1>Agentic OS</h1></div>
      <div className={styles.systemState}><span><i />No live execution</span><small>Rehearsal-safe workspace</small></div>
    </header>
    <nav className={styles.roomNav} aria-label="Agentic OS sections">{agenticNav.map((item) => <button type="button" key={item.id} data-active={view === item.id} onClick={() => setView(item.id)}><span>{item.label}</span>{item.count ? <i>{item.count}</i> : null}</button>)}</nav>
    <main className={styles.roomBody} aria-label={title}>
      {view === "today" && <TodayView operatorName={operatorName} openView={setView} />}
      {view === "approvals" && <ApprovalView />}
      {view === "rehearsal" && <RehearsalView />}
    </main>
  </div>;
}

export function SystemsControlRoom() {
  const [view, setView] = useState<SystemsView>("activity");
  const title = systemsNav.find((item) => item.id === view)?.label ?? "Session activity";
  return <div className={`${styles.controlRoom} ${styles.aquaRoom}`}>
    <header className={styles.roomHeader}>
      <div><span className={styles.liveMark}><i />SUPERPANEL</span><h1>Systems control room</h1></div>
      <div className={styles.systemState}><span><i />Safe operations</span><small>Evidence before recovery</small></div>
    </header>
    <nav className={styles.roomNav} aria-label="Systems control-room sections">{systemsNav.map((item) => <button type="button" key={item.id} data-active={view === item.id} onClick={() => setView(item.id)}><span>{item.label}</span></button>)}</nav>
    <main className={styles.roomBody} aria-label={title}>
      {view === "activity" && <ActivityView />}
      {view === "recovery" && <RecoveryView />}
    </main>
  </div>;
}
