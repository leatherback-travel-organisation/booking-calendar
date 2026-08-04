"use client";

import { useState } from "react";
import styles from "./control-room.module.css";

type SystemsView = "activity" | "recovery";
type RestoreStep = "closed" | "scope" | "isolated" | "evidence";

const sessions = [
  { app: "TRTL", person: "Operations team", last: "12 min ago", window: "09:18–10:04", state: "Active", colour: "coral" },
  { app: "Money", person: "Finance team", last: "48 min ago", window: "08:42–09:28", state: "Recent", colour: "gold" },
  { app: "Recruitment", person: "People team", last: "Yesterday", window: "16:02–16:31", state: "Ended", colour: "blue" },
  { app: "Systems", person: "Systems operator", last: "Now", window: "10:14–now", state: "Active", colour: "mint" },
] as const;

const systemsNav: readonly { id: SystemsView; label: string }[] = [
  { id: "activity", label: "Session activity" },
  { id: "recovery", label: "Backup engine" },
];

function StatusPill({ state }: { state: "ready" | "setup" | "rehearsal" }) {
  const label = state === "ready" ? "Ready" : state === "setup" ? "Setup needed" : "Rehearsal only";
  return <span className={styles.statusPill} data-state={state}><i />{label}</span>;
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

