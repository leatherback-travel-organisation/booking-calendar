"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createRecruitmentCandidateAction,
  createRecruitmentCommentAction,
  saveRecruitmentRoleAction,
  updateRecruitmentCandidateAction,
  type RecruitmentActionResult,
} from "@/lib/recruitment/actions";
import {
  recruitmentStatuses,
  roleReadiness,
  type RecruitmentCandidate,
  type RecruitmentRole,
  type RecruitmentStatus,
  type RecruitmentWorkspace,
} from "@/lib/recruitment/model";
import styles from "./recruitment-workspace.module.css";

const columns: { label: string; hint: string; statuses: RecruitmentStatus[]; moveTo: RecruitmentStatus; tone: string }[] = [
  { label: "Uncategorized", hint: "Status not set", statuses: ["Unreviewed"], moveTo: "Unreviewed", tone: "neutral" },
  { label: "Shortlist", hint: "Worth a closer look", statuses: ["Shortlist"], moveTo: "Shortlist", tone: "blue" },
  { label: "Interview", hint: "First conversation", statuses: ["Interview"], moveTo: "Interview", tone: "sun" },
  { label: "Challenge", hint: "Practical assessment", statuses: ["Challenge"], moveTo: "Challenge", tone: "coral" },
  { label: "2nd Interview", hint: "Deeper conversation", statuses: ["2nd Interview"], moveTo: "2nd Interview", tone: "violet" },
  { label: "Final Round", hint: "Decision stage", statuses: ["Final Round"], moveTo: "Final Round", tone: "rose" },
  { label: "Hire", hint: "Offer accepted", statuses: ["Hire"], moveTo: "Hire", tone: "mint" },
  { label: "Personal Rejection", hint: "Personal response", statuses: ["Personal Rejection"], moveTo: "Personal Rejection", tone: "lavender" },
  { label: "General Rejection", hint: "Standard response", statuses: ["General Rejection"], moveTo: "General Rejection", tone: "purple" },
  { label: "Closed", hint: "Process complete", statuses: ["Closed"], moveTo: "Closed", tone: "slate" },
  { label: "Next opening", hint: "Keep warm", statuses: ["Next opening"], moveTo: "Next opening", tone: "ocean" },
  { label: "Other Role", hint: "Consider elsewhere", statuses: ["Other Role"], moveTo: "Other Role", tone: "peach" },
];
const CANDIDATE_BATCH_SIZE = 50;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function dateLabel(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function roleStatusLabel(status: RecruitmentRole["status"]) {
  return status === "live" ? "Live ads" : status === "ready" ? "Ready to publish" : status === "paused" ? "Paused" : status === "closed" ? "Closed" : "Setup needed";
}

function Icon({ name }: { name: "search" | "plus" | "people" | "role" | "clock" | "file" | "arrow" | "close" | "link" | "pin" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "search") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" {...common}/><path d="m15.5 15.5 4.5 4.5" {...common}/></svg>;
  if (name === "plus") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" {...common}/></svg>;
  if (name === "people") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" {...common}/><path d="M3.5 19c.8-3.5 2.6-5.2 5.5-5.2s4.7 1.7 5.5 5.2M15 6.5a3 3 0 0 1 0 5.8M15.5 14c2.7.4 4.3 2 5 5" {...common}/></svg>;
  if (name === "role") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="13" rx="2.5" {...common}/><path d="M8.5 6.5V4h7v2.5M3.5 12h17M10 12v2h4v-2" {...common}/></svg>;
  if (name === "clock") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" {...common}/><path d="M12 7v5l3.5 2" {...common}/></svg>;
  if (name === "file") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4V21H6zM14 3.5V8h4M9 12h6M9 16h5" {...common}/></svg>;
  if (name === "arrow") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" {...common}/></svg>;
  if (name === "close") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" {...common}/></svg>;
  if (name === "link") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4M8.5 16.5l-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M15.5 7.5l1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" {...common}/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V10M6 3h12l-2 7H8z" {...common}/></svg>;
}

export function RecruitmentWorkspaceView({ workspace }: { workspace: RecruitmentWorkspace }) {
  const router = useRouter();
  const [view, setView] = useState<"pipeline" | "roles">("pipeline");
  const [cardDensity, setCardDensity] = useState<"compact" | "resume">("compact");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedCandidate, setSelectedCandidate] = useState<RecruitmentCandidate | null>(null);
  const [editingInterviewNotes, setEditingInterviewNotes] = useState(false);
  const [editingRole, setEditingRole] = useState<RecruitmentRole | null>(null);
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [notice, setNotice] = useState<RecruitmentActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [candidateState, setCandidateState] = useState({ source: workspace.candidates, value: workspace.candidates });
  const [savingCandidateIds, setSavingCandidateIds] = useState<Set<string>>(() => new Set());
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [columnLimits, setColumnLimits] = useState<Record<string, number>>({});
  const rolePickerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeRoleMenu(event: MouseEvent) {
      if (!rolePickerRef.current?.contains(event.target as Node)) setRoleMenuOpen(false);
    }
    document.addEventListener("mousedown", closeRoleMenu);
    return () => document.removeEventListener("mousedown", closeRoleMenu);
  }, []);

  const candidates = candidateState.source === workspace.candidates ? candidateState.value : workspace.candidates;

  function updateLocalCandidates(update: (current: RecruitmentCandidate[]) => RecruitmentCandidate[]) {
    setCandidateState((current) => {
      const value = current.source === workspace.candidates ? current.value : workspace.candidates;
      return { source: workspace.candidates, value: update(value) };
    });
  }

  const visibleCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (roleFilter !== "all" && !candidate.roles.includes(roleFilter)) return false;
      return !needle || `${candidate.name} ${candidate.email ?? ""} ${candidate.location ?? ""} ${candidate.roles.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [candidates, query, roleFilter]);

  const visibleRoles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspace.roles.filter((role) => !needle || `${role.title} ${role.hiringManager} ${role.location} ${role.advertisingChannels.join(" ")}`.toLowerCase().includes(needle));
  }, [query, workspace.roles]);

  const pipelineRoleNames = [...new Set(candidates.flatMap((candidate) => candidate.roles))].sort();
  const interviewCount = candidates.filter((candidate) => ["Interview", "2nd Interview", "Final Round"].includes(candidate.status)).length;
  const readyRoles = workspace.roles.filter((role) => role.status === "live" || role.status === "ready").length;

  function finish(result: RecruitmentActionResult, close?: () => void, refresh = true) {
    setNotice(result);
    if (result.ok) {
      close?.();
      if (refresh) router.refresh();
    }
  }

  function moveCandidate(candidate: RecruitmentCandidate, status: RecruitmentStatus) {
    if (!workspace.writesEnabled || candidate.status === status || savingCandidateIds.has(candidate.id)) return;
    const previousStatus = candidate.status;
    updateLocalCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, status } : item));
    setSelectedCandidate((current) => current?.id === candidate.id ? { ...current, status } : current);
    setSavingCandidateIds((current) => new Set(current).add(candidate.id));
    startTransition(async () => {
      const result = await updateRecruitmentCandidateAction({ id: candidate.id, status, notes: candidate.notes ?? "" });
      setSavingCandidateIds((current) => {
        const next = new Set(current);
        next.delete(candidate.id);
        return next;
      });
      if (!result.ok) {
        updateLocalCandidates((current) => current.map((item) => item.id === candidate.id ? { ...item, status: previousStatus } : item));
        setSelectedCandidate((current) => current?.id === candidate.id ? { ...current, status: previousStatus } : current);
      }
      finish(result, undefined, false);
    });
  }

  function dropCandidate(event: DragEvent, status: RecruitmentStatus) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/recruitment-candidate") || dragging;
    const candidate = candidates.find((item) => item.id === id);
    setDragging(null);
    setDragOverColumn(null);
    if (candidate) moveCandidate(candidate, status);
  }

  function scrollBoard(direction: -1 | 1) {
    const board = boardRef.current;
    if (!board) return;
    board.scrollBy({ left: direction * Math.max(320, board.clientWidth * .8), behavior: "smooth" });
  }

  function submitCandidateUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCandidate) return;
    const data = new FormData(event.currentTarget);
    startTransition(async () => finish(await updateRecruitmentCandidateAction({ id: selectedCandidate.id, status: data.get("status"), notes: data.get("notes") }), () => setSelectedCandidate(null)));
  }

  function submitInterviewNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCandidate) return;
    const data = new FormData(event.currentTarget);
    const firstInterviewNotes = String(data.get("firstInterviewNotes") ?? "").trim();
    const secondInterviewNotes = String(data.get("secondInterviewNotes") ?? "").trim();
    const previous = selectedCandidate;
    setSelectedCandidate({ ...selectedCandidate, firstInterviewNotes: firstInterviewNotes || undefined, secondInterviewNotes: secondInterviewNotes || undefined });
    startTransition(async () => {
      const result = await updateRecruitmentCandidateAction({ id: selectedCandidate.id, status: selectedCandidate.status, notes: selectedCandidate.notes ?? "", firstInterviewNotes, secondInterviewNotes });
      if (result.ok) setEditingInterviewNotes(false);
      else setSelectedCandidate(previous);
      finish(result);
    });
  }

  function submitNewCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => finish(await createRecruitmentCandidateAction({ name: data.get("name"), email: data.get("email"), role: data.get("role"), location: data.get("location"), notes: data.get("notes") }), () => setAddingCandidate(false)));
  }

  function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRole) return;
    const data = new FormData(event.currentTarget);
    const channels = String(data.get("channels") ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    startTransition(async () => finish(await saveRecruitmentRoleAction({ title: editingRole.title, status: data.get("status"), hiringManager: data.get("hiringManager"), location: data.get("location"), employmentType: data.get("employmentType"), adCopy: data.get("adCopy"), adUrl: data.get("adUrl"), advertisingChannels: channels, publishingNotes: data.get("publishingNotes") }), () => setEditingRole(null)));
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCandidate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await createRecruitmentCommentAction({ candidateId: selectedCandidate.id, body: data.get("comment") });
      finish(result);
      if (result.ok) form.reset();
    });
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>People &amp; Operations · Internal</span>
          <h1>Recruitment</h1>
          <p>Move good people through a clear process, and know exactly where every role is advertised.</p>
        </div>
        <div className={styles.heroStats}>
          <div><strong>{candidates.length}{workspace.truncated ? "+" : ""}</strong><span>candidates shown</span></div>
          <div><strong>{interviewCount}</strong><span>in interviews</span></div>
          <div><strong>{readyRoles}</strong><span>roles ready or live</span></div>
        </div>
      </section>

      <section className={styles.controlBar}>
        <div className={styles.tabs} role="tablist" aria-label="Recruitment views">
          <button type="button" role="tab" aria-selected={view === "pipeline"} className={view === "pipeline" ? styles.activeTab : ""} onClick={() => setView("pipeline")}><Icon name="people"/>Pipeline</button>
          <button type="button" role="tab" aria-selected={view === "roles"} className={view === "roles" ? styles.activeTab : ""} onClick={() => setView("roles")}><Icon name="role"/>Roles &amp; ads</button>
        </div>
        <label className={styles.search}><span className="sr-only">Search recruitment</span><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "pipeline" ? "Search candidates…" : "Search roles…"}/></label>
        {view === "pipeline" && <div className={styles.rolePicker} ref={rolePickerRef}><span>Role in pipeline</span><button type="button" aria-haspopup="listbox" aria-expanded={roleMenuOpen} onClick={() => setRoleMenuOpen((open) => !open)}><strong>{roleFilter === "all" ? "All roles" : roleFilter}</strong><i/></button>{roleMenuOpen && <div className={styles.roleMenu} role="listbox" aria-label="Filter candidates by role"><button type="button" role="option" aria-selected={roleFilter === "all"} onClick={() => { setRoleFilter("all"); setRoleMenuOpen(false); }}>All roles <small>{candidates.length}</small></button>{pipelineRoleNames.map((role) => <button type="button" role="option" aria-selected={roleFilter === role} key={role} onClick={() => { setRoleFilter(role); setRoleMenuOpen(false); }}>{role}<small>{candidates.filter((candidate) => candidate.roles.includes(role)).length}</small></button>)}</div>}</div>}
        {view === "pipeline" && <div className={styles.densityToggle} aria-label="Candidate card layout"><button type="button" aria-pressed={cardDensity === "compact"} onClick={() => setCardDensity("compact")}>Compact</button><button type="button" aria-pressed={cardDensity === "resume"} onClick={() => setCardDensity("resume")}>CV cards</button></div>}
        {view === "pipeline" && <button type="button" className={styles.primaryButton} disabled={!workspace.writesEnabled} onClick={() => setAddingCandidate(true)}><Icon name="plus"/>Add candidate</button>}
      </section>

      {workspace.origin === "unavailable" && <section className={styles.unavailable}><span>Connection needed</span><h2>The Hiring table is temporarily unavailable.</h2><p>No candidate data has been substituted. Check the Recruitment Airtable connection before making decisions.</p></section>}
      {workspace.integrityIssues > 0 && <div className={styles.warning}>Cove omitted {workspace.integrityIssues} incomplete Hiring {workspace.integrityIssues === 1 ? "record" : "records"}.</div>}
      {workspace.truncated && <div className={styles.warning}><strong>Candidate list incomplete</strong><span>Cove could not finish loading every page from the Hiring table. Reload or check the Airtable connection before making decisions.</span></div>}

      {view === "pipeline" && workspace.origin !== "unavailable" && (
        <section className={styles.pipelineSection} aria-label="Candidate pipeline">
          <header className={styles.sectionHeading}><div><span>{workspace.origin === "airtable" ? "Live Hiring data" : "Demonstration data"}</span><h2>Candidate pipeline</h2></div><div className={styles.boardHeadingTools}><span><strong>{columns.length} phases</strong> · {pipelineRoleNames.length} roles represented</span><div className={styles.boardNav} aria-label="Move across hiring phases"><button type="button" onClick={() => scrollBoard(-1)} aria-label="Scroll phases left"><Icon name="arrow"/></button><button type="button" onClick={() => scrollBoard(1)} aria-label="Scroll phases right"><Icon name="arrow"/></button></div></div></header>
          <div className={styles.board} ref={boardRef} data-testid="candidate-board">
            {columns.map((column) => {
              const candidates = visibleCandidates.filter((candidate) => column.statuses.includes(candidate.status));
              const limit = columnLimits[column.label] ?? CANDIDATE_BATCH_SIZE;
              const displayedCandidates = candidates.slice(0, limit);
              const remainingCandidates = candidates.length - displayedCandidates.length;
              return <section key={column.label} className={`${styles.column} ${styles[column.tone]} ${dragOverColumn === column.label ? styles.dropReady : ""}`} onDragOver={(event) => { event.preventDefault(); setDragOverColumn(column.label); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => dropCandidate(event, column.moveTo)}>
                <header><i/><div><h3>{column.label}</h3><p>{column.hint}</p></div><strong>{candidates.length}</strong></header>
                <div className={styles.cardList}>
                  {displayedCandidates.map((candidate) => {
                    const résumé = candidate.attachments.find((attachment) => attachment.previewUrl) ?? candidate.attachments[0];
                    const saving = savingCandidateIds.has(candidate.id);
                    return <article key={candidate.id} className={`${styles.candidateCard} ${cardDensity === "compact" ? styles.compactCard : styles.resumeCard} ${dragging === candidate.id ? styles.dragging : ""} ${saving ? styles.saving : ""}`} aria-busy={saving}>
                      <button type="button" className={styles.cardButton} draggable={workspace.writesEnabled && !saving} onDragStart={(event) => { setDragging(candidate.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/recruitment-candidate", candidate.id); }} onDragEnd={() => { setDragging(null); setDragOverColumn(null); }} onClick={() => { setSelectedCandidate(candidate); setEditingInterviewNotes(false); }} title={workspace.writesEnabled ? "Drag to another phase or click to open" : "Open candidate"}>
                        <span className={styles.dragCue} aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
                        {cardDensity === "resume" && résumé && <span className={`${styles.documentPreview} ${résumé.previewUrl ? styles.documentPreviewImage : ""}`} style={résumé.previewUrl ? { backgroundImage: `url(${résumé.previewUrl})` } : undefined} aria-hidden="true"><span><Icon name="file"/><i/><i/><i/><i/></span><small>{résumé.filename}</small></span>}
                        {cardDensity === "resume" ? <>
                          <span className={styles.cardTop}><span className={styles.avatar}>{initials(candidate.name)}</span><span className={styles.cardIdentity}><strong>{candidate.name}</strong><small>{candidate.location || "Location not added"}</small></span><span className={styles.cardArrow}><Icon name="arrow"/></span></span>
                          <span className={styles.roleTag}>{candidate.roles[0] || "Role not assigned"}</span>
                          {candidate.notes && <span className={styles.cardNote}>{candidate.notes}</span>}
                        </> : <>
                          <span className={styles.compactIdentity}><strong>{candidate.name}</strong><span className={styles.cardArrow}><Icon name="arrow"/></span></span>
                          <span className={styles.compactRole}>{candidate.roles[0] || "Role not assigned"}</span>
                          {candidate.email && <span className={styles.compactContact}>{candidate.email}</span>}
                          <span className={styles.compactDetails}><span>{candidate.location || "Location not added"}</span>{candidate.assignee && <span>{candidate.assignee}</span>}</span>
                          {candidate.notes && <span className={styles.cardNote}>{candidate.notes}</span>}
                        </>}
                        <span className={styles.cardMeta}><span><Icon name="clock"/>{dateLabel(candidate.updatedAt || candidate.createdAt)}</span><span>{candidate.attachments.length ? <><Icon name="file"/>{candidate.attachments.length}</> : "No files"}</span></span>
                      </button>
                    </article>;
                  })}
                  {candidates.length === 0 && <div className={styles.emptyColumn}><span>Clear</span><p>Drop a candidate here</p></div>}
                  {remainingCandidates > 0 && <button type="button" className={styles.loadMore} onClick={() => setColumnLimits((current) => ({ ...current, [column.label]: limit + CANDIDATE_BATCH_SIZE }))}>Show {Math.min(CANDIDATE_BATCH_SIZE, remainingCandidates)} more <small>{remainingCandidates} remaining</small></button>}
                </div>
              </section>;
            })}
          </div>
        </section>
      )}

      {view === "roles" && (
        <section className={styles.rolesSection}>
          <header className={styles.sectionHeading}><div><span>Role launch desk</span><h2>From brief to live ad</h2></div><p>Internal setup only. Public careers pages and candidate applications are intentionally out of scope for now.</p></header>
          <div className={styles.publishingPath} aria-label="Role publishing process">
            {[['01','Define the brief','Owner, location and work setup'],['02','Write the ad','Clear candidate-facing copy'],['03','Plan channels','Record every place it will appear'],['04','Publish & track','Save the live job-ad destination']].map(([number, title, copy]) => <div key={number}><span>{number}</span><strong>{title}</strong><small>{copy}</small></div>)}
          </div>
          <div className={styles.rolesTableShell}>
            <table className={styles.rolesTable}>
              <thead><tr><th>Role</th><th>Publishing</th><th>Pipeline</th><th>Owner &amp; setup</th><th>Advertising</th><th>Readiness</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{visibleRoles.map((role) => {
                const readiness = roleReadiness(role);
                const setup = [role.location, role.employmentType].filter(Boolean).join(" · ");
                return <tr key={role.title}>
                  <th scope="row"><strong>{role.title}</strong><small>{role.adCopy || "No job-ad copy recorded"}</small></th>
                  <td><span className={`${styles.roleState} ${styles[`role_${role.status}`]}`}><i/>{roleStatusLabel(role.status)}</span></td>
                  <td><span className={styles.pipelineCount}><strong>{role.activeCandidates}</strong><small>active</small></span></td>
                  <td><span className={styles.tableStack}><strong>{role.hiringManager || "Owner not assigned"}</strong><small>{setup || "Work setup not defined"}</small></span></td>
                  <td><span className={styles.tableStack}><strong>{role.advertisingChannels.length ? role.advertisingChannels.join(" · ") : "No channels recorded"}</strong>{role.adUrl ? <a href={role.adUrl} target="_blank" rel="noreferrer"><Icon name="link"/>Open job ad</a> : <small className={styles.missingDestination}>Ad destination missing</small>}</span></td>
                  <td><span className={styles.tableReadiness}><span><i style={{ width: `${readiness.percentage}%` }}/></span><small>{readiness.complete}/4 complete</small></span></td>
                  <td><button type="button" className={styles.tableAction} onClick={() => setEditingRole(role)}>Edit <Icon name="arrow"/></button></td>
                </tr>;
              })}</tbody>
            </table>
            {visibleRoles.length === 0 && <div className={styles.emptyRoles}><strong>No roles match this search</strong><span>Clear the search to see the role launch table.</span></div>}
          </div>
        </section>
      )}

      {notice && <div className={`${styles.toast} ${notice.ok ? styles.toastOk : styles.toastError}`} role="status"><span>{notice.message}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close"/></button></div>}

      {selectedCandidate && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedCandidate(null); setEditingInterviewNotes(false); } }}><aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="candidate-title">
        <header className={styles.modalHeader}><div><span>Candidate record</span><h2 id="candidate-title">{selectedCandidate.name}</h2><p>{selectedCandidate.roles.join(" · ") || "Role not assigned"}</p></div><button type="button" onClick={() => { setSelectedCandidate(null); setEditingInterviewNotes(false); }} aria-label="Close candidate"><Icon name="close"/></button></header>
        <div className={styles.candidateSummary}><span className={styles.largeAvatar}>{initials(selectedCandidate.name)}</span><div><span>{selectedCandidate.status}</span><strong>{selectedCandidate.location || "Location not added"}</strong><small>Updated {dateLabel(selectedCandidate.updatedAt || selectedCandidate.createdAt)}</small></div></div>
        <div className={styles.contactRow}>{selectedCandidate.email ? <a href={`mailto:${selectedCandidate.email}`}>{selectedCandidate.email}</a> : <span>Email not added</span>}<span>{selectedCandidate.schedule.join(" · ") || "Schedule not added"}</span></div>
        {(selectedCandidate.interviewer || selectedCandidate.assignee) && <dl className={styles.detailList}>{selectedCandidate.assignee && <div><dt>Assignee</dt><dd>{selectedCandidate.assignee}</dd></div>}{selectedCandidate.interviewer && <div><dt>Interviewer</dt><dd>{selectedCandidate.interviewer}</dd></div>}</dl>}
        {selectedCandidate.attachments.length > 0 && <section className={styles.fileSection}><h3>Candidate files</h3>{selectedCandidate.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer"><Icon name="file"/><span><strong>{file.filename}</strong><small>{file.type || "Attachment"}</small></span><Icon name="arrow"/></a>)}</section>}
        <section className={styles.interviewNotes}>
          <header><h3>Interview notes</h3>{!editingInterviewNotes && <button type="button" onClick={() => setEditingInterviewNotes(true)} disabled={!workspace.writesEnabled}>{selectedCandidate.firstInterviewNotes || selectedCandidate.secondInterviewNotes ? "Edit notes" : "Add notes"}</button>}</header>
          {editingInterviewNotes ? <form className={styles.interviewNotesForm} onSubmit={submitInterviewNotes}>
            <label><span>First interview</span><textarea name="firstInterviewNotes" rows={8} defaultValue={selectedCandidate.firstInterviewNotes} placeholder="Capture evidence, strengths, concerns and follow-ups…" autoFocus/></label>
            <label><span>Second interview</span><textarea name="secondInterviewNotes" rows={8} defaultValue={selectedCandidate.secondInterviewNotes} placeholder="Add notes from the deeper conversation…"/></label>
            <div><button type="button" className={styles.secondaryButton} onClick={() => setEditingInterviewNotes(false)}>Cancel</button><button className={styles.primaryButton} disabled={isPending || !workspace.writesEnabled}>{isPending ? "Saving…" : "Save interview notes"}</button></div>
          </form> : selectedCandidate.firstInterviewNotes || selectedCandidate.secondInterviewNotes ? <>{selectedCandidate.firstInterviewNotes && <div><span>First interview</span><p>{selectedCandidate.firstInterviewNotes}</p></div>}{selectedCandidate.secondInterviewNotes && <div><span>Second interview</span><p>{selectedCandidate.secondInterviewNotes}</p></div>}</> : <div className={styles.emptyInterviewNotes}><strong>No interview notes yet</strong><p>Add notes after the first or second conversation so the hiring team has one shared record.</p></div>}
        </section>
        <section className={styles.commentThread}>
          <header><div><span>Shared discussion</span><h3>Candidate thread</h3></div><strong>{selectedCandidate.comments.length}</strong></header>
          <div className={styles.commentList}>
            {selectedCandidate.comments.map((comment) => <article key={comment.id}><span>{comment.authorInitials}</span><div><header><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{dateLabel(comment.createdAt)}</time></header><p>{comment.body}</p></div></article>)}
            {selectedCandidate.comments.length === 0 && <div className={styles.emptyComments}><strong>Start the conversation</strong><p>Questions, impressions and follow-ups stay together here.</p></div>}
          </div>
          <form onSubmit={submitComment}><label><span className="sr-only">Add a comment</span><textarea name="comment" rows={3} required placeholder="Add to the candidate thread…"/></label><button className={styles.threadButton} disabled={isPending || !workspace.writesEnabled}>{isPending ? "Posting…" : "Post comment"}</button></form>
        </section>
        <form className={styles.editForm} onSubmit={submitCandidateUpdate}><label><span>Pipeline stage</span><select name="status" defaultValue={selectedCandidate.status}>{recruitmentStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Internal notes</span><textarea name="notes" rows={6} defaultValue={selectedCandidate.notes}/></label><button className={styles.primaryButton} disabled={isPending || !workspace.writesEnabled}>{isPending ? "Saving…" : "Save candidate"}</button></form>
      </aside></div>}

      {addingCandidate && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddingCandidate(false); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="new-candidate-title"><header className={styles.modalHeader}><div><span>Hiring inbox</span><h2 id="new-candidate-title">Add a candidate</h2><p>Create a clean starting record in the Hiring table.</p></div><button type="button" onClick={() => setAddingCandidate(false)} aria-label="Close"><Icon name="close"/></button></header><form className={styles.formGrid} onSubmit={submitNewCandidate}><label><span>Full name *</span><input name="name" required autoFocus/></label><label><span>Email</span><input name="email" type="email"/></label><label className={styles.fullField}><span>Role *</span><select name="role" required defaultValue=""><option value="" disabled>Select a role</option>{workspace.roles.map((role) => <option key={role.title}>{role.title}</option>)}</select></label><label><span>Location</span><input name="location" placeholder="City, country or time zone"/></label><label className={styles.fullField}><span>Internal notes</span><textarea name="notes" rows={5}/></label><div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setAddingCandidate(false)}>Cancel</button><button className={styles.primaryButton} disabled={isPending}>{isPending ? "Adding…" : "Add to inbox"}</button></div></form></section></div>}

      {editingRole && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRole(null); }}><section className={`${styles.modal} ${styles.roleModal}`} role="dialog" aria-modal="true" aria-labelledby="role-modal-title"><header className={styles.modalHeader}><div><span>Role launch plan</span><h2 id="role-modal-title">{editingRole.title}</h2><p>Keep the brief, channels and live job-ad destination together.</p></div><button type="button" onClick={() => setEditingRole(null)} aria-label="Close"><Icon name="close"/></button></header><form key={editingRole.title} className={styles.formGrid} onSubmit={submitRole}><label><span>Publishing state</span><select name="status" defaultValue={editingRole.status}><option value="draft">Draft</option><option value="ready">Ready to publish</option><option value="live">Live</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label><label><span>Hiring owner</span><input name="hiringManager" defaultValue={editingRole.hiringManager}/></label><label><span>Location / time zone</span><input name="location" defaultValue={editingRole.location}/></label><label><span>Employment type</span><input name="employmentType" defaultValue={editingRole.employmentType} placeholder="Full-time, part-time…"/></label><label className={styles.fullField}><span>Job-ad copy</span><textarea name="adCopy" rows={6} defaultValue={editingRole.adCopy} placeholder="A concise description candidates will understand…"/></label><label className={styles.fullField}><span>Where this role is advertised</span><textarea name="channels" rows={3} defaultValue={editingRole.advertisingChannels.join("\n")} placeholder={'LinkedIn\nWe Work Remotely\nInternal referrals'}/><small>One channel per line.</small></label><label className={styles.fullField}><span>Live job-ad link</span><input name="adUrl" type="url" defaultValue={editingRole.adUrl} placeholder="https://…"/></label><label className={styles.fullField}><span>Publishing notes</span><textarea name="publishingNotes" rows={3} defaultValue={editingRole.publishingNotes}/></label><div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setEditingRole(null)}>Cancel</button><button className={styles.primaryButton} disabled={isPending}>{isPending ? "Saving…" : "Save role plan"}</button></div></form></section></div>}
    </div>
  );
}
