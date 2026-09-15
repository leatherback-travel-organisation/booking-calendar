"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  GARDEN_BRANDS,
  GARDEN_TEAMS,
  GROWTH_STAGES,
  QUARTER_THEMES,
  SYSTEM_GROUPS,
  involvedPeople,
  attentionItemKey,
  isActiveStage,
  overlapPairKey,
  structurallyAware,
  personKey,
  stageChipTone,
  stalenessFlag,
  type AcknowledgementRecord,
  type GardenProject,
  type GrowthStage,
  type PersonRef,
} from "@/lib/garden/model.ts";
import { detectOverlaps, detectTestingConflicts, type ProjectOverlap } from "@/lib/garden/overlaps.ts";
import { findBestMeetingSlot, suggestOmissions, type MeetingAttendee, type ScoredSlot } from "@/lib/garden/meeting.ts";
import {
  acknowledgeCancellation,
  confirmAttentionMeeting,
  createGardenProject,
  dismissAttention,
  notifyAttentionTeam,
  proposeAttentionMeeting,
  updateGardenProject,
  type AttentionActionInput,
  type GardenProjectInput,
} from "@/lib/garden/actions.ts";
import type { GardenWorkspaceData } from "@/lib/garden/server.ts";
import styles from "./garden-workspace.module.css";

const STAGE_ORDER: GrowthStage[] = [
  "Active work",
  "Testing or roll out",
  "In Planning",
  "Complete",
  "Cancelled or replaced",
];

const DEMO_FIELD_LABELS: Record<string, string> = {
  purpose: "purpose",
  owner: "owner",
  growthStage: "growth stage",
  estimatedCompletion: "estimated completion",
  teams: "teams",
  systems: "systems",
  brands: "brands",
  quarterTheme: "quarter theme",
  testingTeams: "testing owners",
  cancellationReason: "cancellation reason",
};

const dateFormat = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const stampFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = Date.parse(`${iso}T00:00:00`);
  return Number.isNaN(parsed) ? "—" : dateFormat.format(parsed);
}

function formatStamp(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? "—" : stampFormat.format(parsed);
}

function initialsOf(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function toInput(project: GardenProject): GardenProjectInput {
  return {
    name: project.name,
    purpose: project.purpose,
    owner: project.owner,
    sponsor: project.sponsor,
    teammates: project.teammates,
    growthStage: project.growthStage,
    estimatedCompletion: project.estimatedCompletion,
    teams: project.teams as GardenProjectInput["teams"],
    systems: project.systems,
    brands: project.brands as GardenProjectInput["brands"],
    quarterTheme: project.quarterTheme,
    projectLink: project.projectLink,
    notes: project.notes,
    cancellationReason: project.cancellationReason,
    testingOwners: project.testingOwners,
    testingTeams: project.testingTeams as GardenProjectInput["testingTeams"],
    relatedProjectIds: project.relatedProjectIds,
  };
}

type Notice = { tone: "ok" | "error" | "info"; message: string } | null;

export function GardenWorkspace({ workspace }: { workspace: GardenWorkspaceData }) {
  const [projects, setProjects] = useState<GardenProject[]>(workspace.projects);
  const [acks, setAcks] = useState<AcknowledgementRecord[]>(workspace.acknowledgements);
  const [view, setView] = useState<"garden" | "archive">("garden");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [themeFilter, setThemeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set(workspace.dismissedKeys));
  const [proposing, setProposing] = useState<string | null>(null);
  type ProposalOptionView = {
    omitName: string | null;
    startIso: string;
    endIso: string;
    attendees: Array<{ name: string; email: string; timezone: string; band: "comfortable" | "early" | "late" | "rough" }>;
  };
  const [proposal, setProposal] = useState<{
    itemKey: string;
    title: string;
    options: ProposalOptionView[];
    skipped: string[];
    demo: boolean;
  } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [, startTransition] = useTransition();
  const demoNoticeShown = useRef(false);

  const viewerKeys = useMemo(() => new Set(workspace.viewer.keys), [workspace.viewer.keys]);
  const isViewer = (person: PersonRef) =>
    viewerKeys.has(personKey(person)) || (person.email !== null && viewerKeys.has(person.email.trim().toLowerCase()));
  const involvesViewer = (project: GardenProject) => involvedPeople(project).some(isViewer);

  const now = useMemo(() => new Date(), []);
  const live = useMemo(() => projects.filter((project) => project.archivedAt === null), [projects]);
  const archived = useMemo(() => projects.filter((project) => project.archivedAt !== null), [projects]);
  const overlaps = useMemo(() => detectOverlaps(projects), [projects]);
  const awareByPair = useMemo(
    () => new Map(workspace.awareness.map((entry) => [entry.pairKey, entry])),
    [workspace.awareness],
  );
  const testingConflicts = useMemo(() => detectTestingConflicts(projects), [projects]);
  const byId = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  // A crossover the whole team demonstrably already knows about (from the
  // Slack sweep, or because the same people run both projects) raises no
  // notifications — it lives on quietly as the overlap pill and drawer note.
  const overlapAwareness = (overlap: ProjectOverlap): { source: string; note: string | null } | null => {
    const recorded = awareByPair.get(overlapPairKey(overlap.projectA, overlap.projectB));
    if (recorded) return { source: recorded.source, note: recorded.note };
    const a = byId.get(overlap.projectA);
    const b = byId.get(overlap.projectB);
    if (a && b && structurallyAware(a, b)) return { source: "same people", note: "The same people run both projects" };
    return null;
  };

  const ackedKeys = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ack of acks) {
      if (!ack.acknowledgedAt) continue;
      const set = map.get(ack.projectId) ?? new Set<string>();
      set.add(ack.personKey);
      map.set(ack.projectId, set);
    }
    return map;
  }, [acks]);

  const ackState = (project: GardenProject) => {
    const required = involvedPeople(project);
    const acked = ackedKeys.get(project.id) ?? new Set<string>();
    const outstanding = required.filter((person) => !acked.has(personKey(person)));
    return { required, outstanding, allAcked: required.length > 0 && outstanding.length === 0 };
  };

  function flashDemoNotice() {
    if (workspace.writesEnabled || demoNoticeShown.current) return;
    demoNoticeShown.current = true;
    setNotice({ tone: "info", message: "Demonstration data — changes stay in this tab only." });
  }

  function applyUpdate(project: GardenProject, patch: Partial<GardenProject>) {
    const merged: GardenProject = {
      ...project,
      ...patch,
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: { id: null, name: workspace.viewer.name, email: workspace.viewer.email },
    };
    if (patch.growthStage && patch.growthStage !== project.growthStage) {
      merged.stageChangedAt = merged.lastEditedAt;
      merged.completedAt = patch.growthStage === "Complete" ? merged.lastEditedAt : null;
      merged.cancelledAt = patch.growthStage === "Cancelled or replaced" ? merged.lastEditedAt : null;
      if (isActiveStage(patch.growthStage)) merged.archivedAt = null;
    }
    setProjects((current) => current.map((candidate) => (candidate.id === project.id ? merged : candidate)));
    if (!workspace.writesEnabled) {
      flashDemoNotice();
      return;
    }
    startTransition(async () => {
      const result = await updateGardenProject(project.id, toInput(merged));
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        setProjects((current) => current.map((candidate) => (candidate.id === project.id ? project : candidate)));
      }
    });
  }

  function acknowledge(project: GardenProject) {
    const me = involvedPeople(project).find(isViewer);
    if (!me) return;
    const record: AcknowledgementRecord = {
      projectId: project.id,
      personKey: personKey(me),
      personName: me.name,
      acknowledgedAt: new Date().toISOString(),
    };
    const before = acks;
    setAcks((current) => [...current.filter((ack) => !(ack.projectId === project.id && ack.personKey === record.personKey)), record]);
    if (!workspace.writesEnabled) {
      flashDemoNotice();
      return;
    }
    startTransition(async () => {
      const result = await acknowledgeCancellation(project.id);
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        setAcks(before);
      }
    });
  }

  function noted(item: { key: string; kind: "overlap" | "testing" | "stale"; projectIds: string[]; subject?: string }) {
    setDismissed((current) => new Set([...current, item.key]));
    if (proposal?.itemKey === item.key) setProposal(null);
    if (!workspace.writesEnabled) {
      flashDemoNotice();
      return;
    }
    const input: AttentionActionInput = { kind: item.kind, projectIds: item.projectIds, subject: item.subject };
    startTransition(async () => {
      const result = await dismissAttention(input);
      if (!result.ok) setNotice({ tone: "error", message: result.message });
    });
  }

  function notifyTeam(item: { key: string; kind: "overlap" | "testing" | "stale"; projectIds: string[]; subject?: string; text: string }) {
    const people = new Set(
      item.projectIds.flatMap((id) => {
        const project = byId.get(id);
        return project ? involvedPeople(project).map((person) => person.name) : [];
      }),
    );
    if (!window.confirm(`Post this to #notion-automation-testing, tagging ${people.size} project team member${people.size === 1 ? "" : "s"}?`)) return;
    if (!workspace.writesEnabled) {
      setNotice({ tone: "info", message: "Demo environment — the Slack message wasn't sent." });
      return;
    }
    const input: AttentionActionInput = { kind: item.kind, projectIds: item.projectIds, subject: item.subject };
    startTransition(async () => {
      const result = await notifyAttentionTeam(input);
      setNotice({ tone: result.ok ? "ok" : "error", message: result.message });
    });
  }

  function scheduleOffline(
    item: { key: string; projectIds: string[] },
    projectNames: string,
  ) {
    const people = [
      ...new Map(
        item.projectIds.flatMap((id) => {
          const project = byId.get(id);
          return project ? involvedPeople(project).filter((person) => person.email) : [];
        }).map((person) => [person.email, { name: person.name, email: person.email! }]),
      ).values(),
    ];
    const attendees: MeetingAttendee[] = people.map((person) => ({
      email: person.email,
      timezone: workspace.timezoneByEmail[person.email] ?? "Australia/Sydney",
      busy: [],
    }));
    const nameByEmail = new Map(people.map((person) => [person.email, person.name]));
    const tzByEmail = new Map(attendees.map((attendee) => [attendee.email, attendee.timezone]));
    const toView = (slot: ScoredSlot, omitEmail: string | null): ProposalOptionView => ({
      omitName: omitEmail ? (nameByEmail.get(omitEmail) ?? omitEmail) : null,
      startIso: slot.startIso,
      endIso: slot.endIso,
      attendees: slot.perAttendee.map((entry) => ({
        name: nameByEmail.get(entry.email) ?? entry.email,
        email: entry.email,
        timezone: tzByEmail.get(entry.email) ?? "Australia/Sydney",
        band: entry.band,
      })),
    });
    const search = {
      fromIso: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      horizonDays: 7,
      durationMinutes: 30,
    };
    const full = findBestMeetingSlot({ ...search, attendees });
    const options: ProposalOptionView[] = full ? [toView(full, null)] : [];
    if (!full || full.tier > 0) {
      for (const omission of suggestOmissions({ ...search, attendees, fullGroupSlot: full })) {
        options.push(toView(omission.slot, omission.omitEmail));
      }
    }
    if (options.length === 0) {
      setNotice({ tone: "info", message: "Demo — no slot fits this group in the next week." });
      return;
    }
    setProposal({ itemKey: item.key, title: `Garden: ${projectNames}`, options, skipped: [], demo: true });
  }

  function scheduleDiscussion(item: { key: string; kind: "overlap" | "testing" | "stale"; projectIds: string[]; subject?: string }) {
    const projectNames = item.projectIds.map((id) => byId.get(id)?.name).filter(Boolean).join(" ↔ ");
    if (!workspace.writesEnabled) {
      // Demo: first try the server, which runs a REAL read-only proposal
      // against everyone's actual calendars when Google is configured.
      const input: AttentionActionInput = { kind: item.kind, projectIds: item.projectIds, subject: item.subject };
      setProposing(item.key);
      startTransition(async () => {
        const result = await proposeAttentionMeeting(input);
        setProposing(null);
        if (result.ok) {
          setProposal({
            itemKey: item.key,
            title: result.title,
            options: result.proposal.options,
            skipped: result.proposal.skipped,
            demo: true,
          });
          return;
        }
        // No calendars here: fabricate offline, but with each person's REAL
        // directory timezone and the real slot engine — never invented hours.
        scheduleOffline(item, projectNames);
      });
      return;
    }
    const input: AttentionActionInput = { kind: item.kind, projectIds: item.projectIds, subject: item.subject };
    setProposing(item.key);
    startTransition(async () => {
      const result = await proposeAttentionMeeting(input);
      setProposing(null);
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        return;
      }
      setProposal({
        itemKey: item.key,
        title: result.title,
        options: result.proposal.options,
        skipped: result.proposal.skipped,
        demo: result.proposal.demo,
      });
    });
  }

  function confirmDiscussion(option: ProposalOptionView) {
    if (!proposal) return;
    if (proposal.demo) {
      setNotice({ tone: "info", message: "Demo environment — no calendar invites were sent." });
      setProposal(null);
      return;
    }
    const payload = {
      title: proposal.title,
      description: "A 30-minute Garden overlap conversation. Booked from The Garden in Cove.",
      startIso: option.startIso,
      endIso: option.endIso,
      attendees: option.attendees.map((attendee) => ({ name: attendee.name, email: attendee.email })),
    };
    setProposal(null);
    startTransition(async () => {
      const result = await confirmAttentionMeeting(payload);
      setNotice({ tone: result.ok ? "ok" : "error", message: result.message });
    });
  }

  const filtersActive =
    query !== "" || stageFilter !== "" || teamFilter !== "" || brandFilter !== "" || systemFilter !== "" || personFilter !== "" || themeFilter !== "";

  function clearFilters() {
    setQuery("");
    setStageFilter("");
    setTeamFilter("");
    setBrandFilter("");
    setSystemFilter("");
    setPersonFilter("");
    setThemeFilter("");
  }

  const peopleOnProjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      for (const person of involvedPeople(project)) map.set(personKey(person), person.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);

  function matchesFilters(project: GardenProject): boolean {
    const trimmed = query.trim().toLowerCase();
    if (trimmed && !project.name.toLowerCase().includes(trimmed) && !project.owner.name.toLowerCase().includes(trimmed)) return false;
    if (stageFilter && project.growthStage !== stageFilter) return false;
    if (teamFilter && !project.teams.includes(teamFilter)) return false;
    if (brandFilter && !project.brands.includes(brandFilter)) return false;
    if (systemFilter && !project.systems.includes(systemFilter)) return false;
    if (personFilter && !involvedPeople(project).some((person) => personKey(person) === personFilter)) return false;
    if (themeFilter === "Unthemed" && project.quarterTheme !== null) return false;
    if (themeFilter && themeFilter !== "Unthemed" && project.quarterTheme !== themeFilter) return false;
    return true;
  }

  const visible = useMemo(() => {
    const pool = view === "garden" ? live : archived;
    return pool.filter(matchesFilters).sort((a, b) => {
      const mineA = involvesViewer(a) ? 0 : 1;
      const mineB = involvesViewer(b) ? 0 : 1;
      if (mineA !== mineB) return mineA - mineB;
      return Date.parse(b.lastEditedAt) - Date.parse(a.lastEditedAt);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, live, archived, query, stageFilter, teamFilter, brandFilter, systemFilter, personFilter, themeFilter]);

  const attention = useMemo(() => {
    const items: { key: string; kind: "ack" | "overlap" | "testing" | "stale"; text: string; projectIds: string[]; subject?: string; project?: GardenProject }[] = [];
    for (const project of live) {
      if (project.growthStage !== "Cancelled or replaced") continue;
      const state = ackState(project);
      const me = state.outstanding.find(isViewer);
      if (me) {
        items.push({
          key: attentionItemKey("ack", [project.id]),
          kind: "ack",
          text: `${project.name} has been cancelled or replaced${project.cancellationReason ? ` — ${project.cancellationReason}` : ""}`,
          projectIds: [project.id],
          project,
        });
      }
    }
    for (const overlap of overlaps) {
      if (overlap.severity !== "material") continue;
      if (overlapAwareness(overlap)) continue;
      const a = byId.get(overlap.projectA);
      const b = byId.get(overlap.projectB);
      if (!a || !b) continue;
      if (!involvesViewer(a) && !involvesViewer(b)) continue;
      items.push({
        key: attentionItemKey("overlap", [a.id, b.id]),
        kind: "overlap",
        text: `Possible overlap: ${a.name} ↔ ${b.name}`,
        projectIds: [a.id, b.id],
      });
    }
    for (const conflict of testingConflicts) {
      const relevant = conflict.projectIds.some((id) => {
        const project = byId.get(id);
        return project ? involvesViewer(project) : false;
      });
      if (!relevant) continue;
      const subject = `${conflict.subjectKind}:${conflict.subject}`;
      items.push({
        key: attentionItemKey("testing", conflict.projectIds, subject),
        kind: "testing",
        text: `Testing overlap — ${conflict.subject} ${conflict.subjectKind === "team" ? "are" : "is"} testing ${conflict.projectIds.length} projects at once`,
        projectIds: conflict.projectIds,
        subject,
      });
    }
    for (const project of live) {
      const flag = stalenessFlag(project, now);
      if (!flag) continue;
      const mine = isViewer(project.owner) || project.teammates.some(isViewer) || (project.sponsor ? isViewer(project.sponsor) : false);
      if (!mine) continue;
      items.push({
        key: attentionItemKey("stale", [project.id]),
        kind: "stale",
        text:
          flag === "overdue"
            ? `${project.name} passed its estimated completion (${formatDate(project.estimatedCompletion)}) — could use an update`
            : `${project.name} hasn't been updated in a while — could use an update`,
        projectIds: [project.id],
      });
    }
    // Acknowledgements can never be Noted away; everything else respects the
    // viewer's dismissals.
    return items.filter((item) => item.kind === "ack" || !dismissed.has(item.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, overlaps, testingConflicts, acks, dismissed]);

  const recentlyCompleted = live.filter((project) => project.growthStage === "Complete");
  const stageCounts = new Map<GrowthStage, number>();
  for (const project of live) stageCounts.set(project.growthStage, (stageCounts.get(project.growthStage) ?? 0) + 1);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const materialOverlaps = overlaps.filter((overlap) => overlap.severity === "material" && !overlapAwareness(overlap));

  return (
    <div className={`people-page ${styles.garden}`}>
      <header className="workspace-page-header">
        <div>
          <span className="section-kicker">Continuous improvement</span>
          <h1>The Garden</h1>
          <p>Every Gardening project across Leatherback — what&apos;s changing, why, and who&apos;s tending it.</p>
        </div>
        <div className="workspace-page-stat">
          <strong>{live.filter((project) => isActiveStage(project.growthStage)).length}</strong>
          <span>projects in motion</span>
        </div>
      </header>

      {notice ? (
        <div className={`${styles.notice} ${styles[`notice-${notice.tone}`]}`} role="status">
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      {view === "garden" && attention.length > 0 ? (
        <section
          className={`${styles.attention} ${attention.some((item) => item.kind === "ack") ? styles.attentionUrgent : ""}`}
          aria-label="Needs your attention"
        >
          {(() => {
            // Acknowledgements are the one thing that must not be missed —
            // they force the panel open; everything else starts tucked away.
            const isOpen = attentionOpen ?? attention.some((item) => item.kind === "ack");
            return (
              <>
                <button type="button" className={styles.attentionToggle} aria-expanded={isOpen} onClick={() => setAttentionOpen(!isOpen)}>
                  <span className={styles.attentionKicker}>Needs your attention</span>
                  <em>{attention.length}</em>
                  <span className={`${styles.attentionChevron} ${isOpen ? styles.attentionChevronOpen : ""}`} aria-hidden="true" />
                </button>
                {!isOpen ? null : (
          <ul>
            {attention.map((item) => (
              <li key={item.key} className={styles[`attention-${item.kind}`]}>
                <div className={styles.attentionRow}>
                  <button type="button" className={styles.attentionText} onClick={() => setSelectedId(item.projectIds[0])}>
                    {item.text}
                  </button>
                  {item.kind === "ack" && item.project ? (
                    <button type="button" className={styles.gotIt} onClick={() => acknowledge(item.project!)}>
                      Got it
                    </button>
                  ) : item.kind !== "ack" ? (
                    <span className={styles.attentionActions}>
                      <button type="button" onClick={() => noted(item as Parameters<typeof noted>[0])} title="Dismiss — you're aware, no further action needed">
                        Noted
                      </button>
                      <button type="button" onClick={() => notifyTeam(item as Parameters<typeof notifyTeam>[0])} title="Slack the project team in #notion-automation-testing">
                        Notify team
                      </button>
                      <button
                        type="button"
                        disabled={proposing === item.key}
                        onClick={() => scheduleDiscussion(item as Parameters<typeof scheduleDiscussion>[0])}
                        title="Find a 30-minute slot that suits everyone and confirm before sending"
                      >
                        {proposing === item.key ? "Checking calendars…" : "Schedule 30 min"}
                      </button>
                    </span>
                  ) : null}
                </div>
                {proposal && proposal.itemKey === item.key ? (
                  <div className={styles.proposalCard}>
                    {proposal.options[0]?.omitName !== null ? (
                      <strong>No time this week fits everyone — options that leave one person out:</strong>
                    ) : null}
                    {proposal.options.map((option, index) => {
                      const stretched = option.attendees.filter((attendee) => attendee.band !== "comfortable");
                      const bandLabel = (band: string) =>
                        band === "early" ? "early start" : band === "late" ? "after hours" : "rough hours";
                      return (
                        <div key={index} className={styles.proposalOption}>
                          <strong>
                            {option.omitName ? `Without ${option.omitName}: ` : proposal.options.length > 1 ? "Everyone: " : "Provisional: "}
                            {formatStamp(option.startIso)} – {new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(Date.parse(option.endIso))}
                            {stretched.length === 0 ? " · in-hours for all" : ""}
                          </strong>
                          {[...new Set(option.attendees.map((attendee) => attendee.timezone))].map((timezone) => {
                            const locals = option.attendees.filter((attendee) => attendee.timezone === timezone);
                            const band = locals[0]?.band ?? "comfortable";
                            return (
                              <span key={timezone}>
                                {new Intl.DateTimeFormat("en-AU", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(Date.parse(option.startIso))}
                                {" in "}
                                {timezone}
                                {" — "}
                                {locals.map((attendee) => attendee.name).join(", ")}
                                {band !== "comfortable" ? ` (${bandLabel(band)})` : ""}
                              </span>
                            );
                          })}
                          <div className={styles.proposalButtons}>
                            <button type="button" className={styles.gotIt} onClick={() => confirmDiscussion(option)}>
                              {option.omitName ? `Confirm without ${option.omitName}` : "Confirm — send invites"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {proposal.skipped.length > 0 ? <span className={styles.proposalSkipped}>Not invited: {proposal.skipped.join(", ")}</span> : null}
                    <div className={styles.proposalButtons}>
                      <button type="button" className={styles.proposalCancel} onClick={() => setProposal(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
                )}
              </>
            );
          })()}
        </section>
      ) : null}

      <section className={styles.controlBar}>
        <div className={styles.viewTabs} role="tablist" aria-label="Garden views">
          <button type="button" role="tab" aria-selected={view === "garden"} className={view === "garden" ? styles.tabActive : ""} onClick={() => setView("garden")}>
            The Garden
          </button>
          <button type="button" role="tab" aria-selected={view === "archive"} className={view === "archive" ? styles.tabActive : ""} onClick={() => setView("archive")}>
            Archive
            {archived.length > 0 ? <em>{archived.length}</em> : null}
          </button>
        </div>
        <label className={styles.search}>
          <span className="sr-only">Search projects</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" />
          <span aria-hidden="true">⌕</span>
        </label>
        <button type="button" className={styles.primaryButton} onClick={() => setCreating(true)}>
          <PlusIcon /> Create Project
        </button>
      </section>

      <section className={styles.filterRow} aria-label="Filters">
        <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} aria-label="Filter by growth stage">
          <option value="">All stages</option>
          {GROWTH_STAGES.map((stage) => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
        <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {GARDEN_TEAMS.map((team) => (
            <option key={team}>{team}</option>
          ))}
        </select>
        <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} aria-label="Filter by brand">
          <option value="">All brands</option>
          {GARDEN_BRANDS.map((brand) => (
            <option key={brand}>{brand}</option>
          ))}
        </select>
        <select value={systemFilter} onChange={(event) => setSystemFilter(event.target.value)} aria-label="Filter by system">
          <option value="">All systems</option>
          {SYSTEM_GROUPS.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.systems.map((system) => (
                <option key={system}>{system}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)} aria-label="Filter by person">
          <option value="">All people</option>
          {peopleOnProjects.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        <select value={themeFilter} onChange={(event) => setThemeFilter(event.target.value)} aria-label="Filter by quarter theme">
          <option value="">All themes</option>
          {QUARTER_THEMES.map((theme) => (
            <option key={theme}>{theme}</option>
          ))}
          <option>Unthemed</option>
        </select>
        {filtersActive ? (
          <button type="button" className={styles.clearFilters} onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </section>

      {view === "garden" ? (
        <>
          <section className={styles.stageStrip} aria-label="Projects by growth stage">
            {STAGE_ORDER.filter((stage) => stage !== "Cancelled or replaced" || (stageCounts.get(stage) ?? 0) > 0).map((stage) => (
              <button
                key={stage}
                type="button"
                className={`${styles.stageStat} ${stageFilter === stage ? styles.stageStatActive : ""}`}
                onClick={() => setStageFilter(stageFilter === stage ? "" : stage)}
              >
                <strong>{stageCounts.get(stage) ?? 0}</strong>
                <StageChip stage={stage} />
              </button>
            ))}
          </section>

          {materialOverlaps.length > 0 && !filtersActive ? (
            <section className={styles.overlapPanel} aria-label="Project overlaps">
              <span className={styles.panelKicker}>Worth a conversation</span>
              <ul>
                {materialOverlaps.map((overlap) => {
                  const a = byId.get(overlap.projectA);
                  const b = byId.get(overlap.projectB);
                  if (!a || !b) return null;
                  return (
                    <li key={`${overlap.projectA}:${overlap.projectB}`}>
                      <div className={styles.overlapPair}>
                        <button type="button" onClick={() => setSelectedId(a.id)}>
                          {a.name}
                        </button>
                        <span aria-hidden="true">↔</span>
                        <button type="button" onClick={() => setSelectedId(b.id)}>
                          {b.name}
                        </button>
                      </div>
                      <span className={styles.overlapReasons}>{overlap.reasons.join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {view === "archive" && !filtersActive ? (
        <p className={styles.archiveIntro}>
          The reference library: completed work worth revisiting, and cancelled or replaced projects with the reason they stopped.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className={styles.empty}>
          {view === "archive" && !filtersActive ? (
            <>
              <strong>The Archive is empty for now.</strong>
              <span>Completed projects move here a month after they finish; cancelled or replaced projects keep their reason here.</span>
            </>
          ) : (
            <>
              <strong>No projects match these filters.</strong>
              <span>Try widening the search{filtersActive ? " or clear the filters" : ""}.</span>
              {filtersActive ? (
                <button type="button" className={styles.clearFilters} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : view === "archive" ? (
        <>
          {(["Complete", "Cancelled or replaced"] as GrowthStage[]).map((stage) => {
            const group = visible.filter((project) => project.growthStage === stage);
            if (group.length === 0) return null;
            return (
              <section key={stage} className={styles.stageSection}>
                <h2 className={styles.stageHeading}>
                  {stage === "Complete" ? "Complete" : "Cancelled or replaced"} <em>{group.length}</em>
                </h2>
                <div className={styles.cardGrid}>
                  {group.map((project) => (
                    <ProjectCard key={project.id} project={project} ackState={ackState(project)} overlaps={overlaps} viewerInvolved={involvesViewer(project)} now={now} onOpen={() => setSelectedId(project.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      ) : (
        <>
          {STAGE_ORDER.map((stage) => {
            const group = visible.filter((project) => project.growthStage === stage);
            if (group.length === 0) return null;
            const label =
              stage === "Complete" ? "Recently completed" : stage === "Cancelled or replaced" ? "Cancelled or replaced" : stage;
            return (
              <section key={stage} className={styles.stageSection}>
                <h2 className={styles.stageHeading}>
                  {label} <em>{group.length}</em>
                </h2>
                <div className={styles.cardGrid}>
                  {group.map((project) => (
                    <ProjectCard key={project.id} project={project} ackState={ackState(project)} overlaps={overlaps} viewerInvolved={involvesViewer(project)} now={now} onOpen={() => setSelectedId(project.id)} />
                  ))}
                </div>
              </section>
            );
          })}
          {recentlyCompleted.length > 0 ? (
            <p className={styles.archiveNote}>Completed projects stay here for a month, then move to the Archive on their own.</p>
          ) : null}
        </>
      )}

      {selected ? (
        <ProjectDrawer
          key={selected.id}
          project={selected}
          workspace={workspace}
          projects={projects}
          overlaps={overlaps}
          awarenessFor={overlapAwareness}
          ackState={ackState(selected)}
          isViewer={isViewer}
          onClose={() => setSelectedId(null)}
          onOpen={(id) => setSelectedId(id)}
          onUpdate={(patch) => applyUpdate(selected, patch)}
          onAcknowledge={() => acknowledge(selected)}
        />
      ) : null}

      {creating ? (
        <CreateDrawer
          workspace={workspace}
          onClose={() => setCreating(false)}
          onCreate={(input) => {
            const optimistic: GardenProject = {
              ...input,
              id: crypto.randomUUID(),
              teams: [...input.teams],
              brands: [...input.brands],
              testingTeams: [...input.testingTeams],
              demoFields: [],
              createdAt: new Date().toISOString(),
              createdBy: { id: null, name: workspace.viewer.name, email: workspace.viewer.email },
              lastEditedAt: new Date().toISOString(),
              lastEditedBy: { id: null, name: workspace.viewer.name, email: workspace.viewer.email },
              stageChangedAt: new Date().toISOString(),
              completedAt: input.growthStage === "Complete" ? new Date().toISOString() : null,
              cancelledAt: input.growthStage === "Cancelled or replaced" ? new Date().toISOString() : null,
              archivedAt: null,
            };
            setProjects((current) => [optimistic, ...current]);
            setCreating(false);
            if (!workspace.writesEnabled) {
              flashDemoNotice();
              return;
            }
            startTransition(async () => {
              const result = await createGardenProject({ ...input, id: optimistic.id });
              if (!result.ok) {
                setNotice({ tone: "error", message: result.message });
                setProjects((current) => current.filter((candidate) => candidate.id !== optimistic.id));
              }
            });
          }}
        />
      ) : null}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function StageChip({ stage }: { stage: GrowthStage }) {
  return <span className={`${styles.stageChip} ${styles[`stage-${stageChipTone(stage)}`]}`}>{stage}</span>;
}

function Avatar({ person }: { person: PersonRef }) {
  return (
    <span className={styles.avatar} title={person.name} aria-hidden="true">
      {initialsOf(person.name)}
    </span>
  );
}

type AckState = { required: PersonRef[]; outstanding: PersonRef[]; allAcked: boolean };

function ProjectCard({
  project,
  ackState,
  overlaps,
  viewerInvolved,
  now,
  onOpen,
}: {
  project: GardenProject;
  ackState: AckState;
  overlaps: ProjectOverlap[];
  viewerInvolved: boolean;
  now: Date;
  onOpen: () => void;
}) {
  const cancelled = project.growthStage === "Cancelled or replaced";
  const tone = cancelled ? (ackState.allAcked ? styles.cardSettled : styles.cardCancelled) : "";
  const flag = stalenessFlag(project, now);
  const overlapCount = overlaps.filter(
    (overlap) => overlap.projectA === project.id || overlap.projectB === project.id,
  ).length;

  return (
    <button type="button" className={`${styles.card} ${tone}`} onClick={onOpen}>
      <div className={styles.cardTop}>
        <StageChip stage={project.growthStage} />
        {viewerInvolved ? <span className={styles.minePill}>You&apos;re on this</span> : null}
      </div>
      <h3>{project.name}</h3>
      <p className={styles.cardPurpose}>{project.purpose}</p>
      {cancelled && project.cancellationReason ? <p className={styles.cardReason}>{project.cancellationReason}</p> : null}
      <div className={styles.cardPeople}>
        <span className={styles.cardOwner}>
          <Avatar person={project.owner} />
          <span>{project.owner.name}</span>
        </span>
        {project.teammates.length > 0 ? (
          <span className={styles.avatarStack} title={project.teammates.map((person) => person.name).join(", ")}>
            {project.teammates.slice(0, 3).map((person) => (
              <Avatar key={personKey(person)} person={person} />
            ))}
            {project.teammates.length > 3 ? <em>+{project.teammates.length - 3}</em> : null}
          </span>
        ) : null}
      </div>
      <div className={styles.cardMeta}>
        {project.estimatedCompletion ? <span>Est. {formatDate(project.estimatedCompletion)}</span> : null}
        {project.teams.map((team) => (
          <span key={team} className={styles.tagChip}>
            {team}
          </span>
        ))}
        {project.brands.map((brand) => (
          <span key={brand} className={`${styles.tagChip} ${styles.brandChip}`}>
            {brand}
          </span>
        ))}
      </div>
      {(flag || overlapCount > 0) && !cancelled ? (
        <div className={styles.cardFlags}>
          {overlapCount > 0 ? <span className={styles.overlapPill}>{overlapCount === 1 ? "1 overlap" : `${overlapCount} overlaps`}</span> : null}
          {flag ? <span className={styles.stalePill}>Could use an update</span> : null}
        </div>
      ) : null}
    </button>
  );
}

// --- Drawer form controls -------------------------------------------------------

function PersonSelect({
  label,
  value,
  people,
  required,
  onChange,
}: {
  label: string;
  value: PersonRef | null;
  people: GardenWorkspaceData["people"];
  required?: boolean;
  onChange: (person: PersonRef | null) => void;
}) {
  const matchIndex = value
    ? people.findIndex((person) => (value.email && person.email?.toLowerCase() === value.email.toLowerCase()) || (value.id && person.id === value.id))
    : -1;
  return (
    <label className={styles.field}>
      {label}
      <select
        value={matchIndex >= 0 ? String(matchIndex) : value ? "keep" : ""}
        required={required}
        onChange={(event) => {
          if (event.target.value === "") return onChange(null);
          if (event.target.value === "keep") return;
          const person = people[Number(event.target.value)];
          onChange({ id: person.id, name: person.name, email: person.email });
        }}
      >
        <option value="">{required ? "Choose a person…" : "No one yet"}</option>
        {value && matchIndex < 0 ? <option value="keep">{value.name}</option> : null}
        {people.map((person, index) => (
          <option key={person.id} value={index}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PeopleMulti({
  label,
  hint,
  value,
  people,
  onChange,
}: {
  label: string;
  hint?: string;
  value: PersonRef[];
  people: GardenWorkspaceData["people"];
  onChange: (next: PersonRef[]) => void;
}) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      {value.length > 0 ? (
        <div className={styles.chipRow}>
          {value.map((person) => (
            <span key={personKey(person)} className={styles.personChip}>
              {person.name}
              <button type="button" aria-label={`Remove ${person.name}`} onClick={() => onChange(value.filter((candidate) => personKey(candidate) !== personKey(person)))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <select
        value=""
        aria-label={`Add ${label.toLowerCase()}`}
        onChange={(event) => {
          if (event.target.value === "") return;
          const person = people[Number(event.target.value)];
          const ref: PersonRef = { id: person.id, name: person.name, email: person.email };
          if (!value.some((candidate) => personKey(candidate) === personKey(ref))) onChange([...value, ref]);
          event.target.value = "";
        }}
      >
        <option value="">Add a person…</option>
        {people.map((person, index) => (
          <option key={person.id} value={index}>
            {person.name}
          </option>
        ))}
      </select>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function TokenGrid({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <div className={styles.tokenGrid}>
        {options.map((option) => {
          const checked = value.includes(option);
          return (
            <label key={option} className={checked ? styles.tokenChecked : ""}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? value.filter((candidate) => candidate !== option) : [...value, option])}
              />
              {option}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SystemsPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className={styles.field}>
      <span>Systems impacted</span>
      {value.length > 0 ? (
        <div className={styles.chipRow}>
          {value.map((system) => (
            <span key={system} className={styles.personChip}>
              {system}
              <button type="button" aria-label={`Remove ${system}`} onClick={() => onChange(value.filter((candidate) => candidate !== system))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <select
        value=""
        aria-label="Add a system"
        onChange={(event) => {
          if (event.target.value && !value.includes(event.target.value)) onChange([...value, event.target.value]);
          event.target.value = "";
        }}
      >
        <option value="">Add a system…</option>
        {SYSTEM_GROUPS.map((group) => (
          <optgroup key={group.group} label={group.group}>
            {group.systems.map((system) => (
              <option key={system}>{system}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

// --- Project drawer -------------------------------------------------------------

function ProjectDrawer({
  project,
  workspace,
  projects,
  overlaps,
  awarenessFor,
  ackState,
  isViewer,
  onClose,
  onOpen,
  onUpdate,
  onAcknowledge,
}: {
  project: GardenProject;
  workspace: GardenWorkspaceData;
  projects: GardenProject[];
  overlaps: ProjectOverlap[];
  awarenessFor: (overlap: ProjectOverlap) => { source: string; note: string | null } | null;
  ackState: AckState;
  isViewer: (person: PersonRef) => boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onUpdate: (patch: Partial<GardenProject>) => void;
  onAcknowledge: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [purpose, setPurpose] = useState(project.purpose);
  const [notes, setNotes] = useState(project.notes);
  const [link, setLink] = useState(project.projectLink ?? "");
  const [reason, setReason] = useState(project.cancellationReason ?? "");
  const byId = new Map(projects.map((candidate) => [candidate.id, candidate]));
  const mine = overlaps.filter((overlap) => overlap.projectA === project.id || overlap.projectB === project.id);
  const cancelled = project.growthStage === "Cancelled or replaced";
  const viewerOutstanding = cancelled && ackState.outstanding.some(isViewer);
  const outstandingKeys = new Set(ackState.outstanding.map(personKey));
  const acked = new Set(ackState.required.map(personKey).filter((key) => !outstandingKeys.has(key)));
  const relatable = projects
    .filter((candidate) => candidate.id !== project.id && candidate.archivedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="garden-drawer-title">
        <header className={styles.drawerHeader}>
          <div>
            <StageChip stage={project.growthStage} />
            <h2 id="garden-drawer-title">{project.name}</h2>
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {cancelled ? (
          <div className={`${styles.ackPanel} ${ackState.allAcked ? styles.ackSettled : ""}`}>
            <strong>{ackState.allAcked ? "Everyone involved has seen this." : "This project has been cancelled or replaced."}</strong>
            {project.cancellationReason ? <p>{project.cancellationReason}</p> : null}
            <div className={styles.ackPeople}>
              {ackState.required.map((person) => (
                <span key={personKey(person)} className={acked.has(personKey(person)) ? styles.ackDone : styles.ackWaiting}>
                  {person.name}
                </span>
              ))}
            </div>
            {viewerOutstanding ? (
              <button type="button" className={styles.gotIt} onClick={onAcknowledge}>
                Got it
              </button>
            ) : null}
          </div>
        ) : null}

        {mine.length > 0 ? (
          <div className={styles.drawerOverlaps}>
            <span className={styles.panelKicker}>Overlaps</span>
            {mine.map((overlap) => {
              const otherId = overlap.projectA === project.id ? overlap.projectB : overlap.projectA;
              const other = byId.get(otherId);
              if (!other) return null;
              const aware = awarenessFor(overlap);
              return (
                <div key={otherId} className={overlap.severity === "material" && !aware ? styles.overlapMaterial : styles.overlapPossible}>
                  <button type="button" onClick={() => onOpen(otherId)}>
                    {aware ? "Known crossover" : overlap.severity === "material" ? "Possible overlap" : "Worth knowing"}: {other.name}
                  </button>
                  <ul>
                    {overlap.reasons.map((why) => (
                      <li key={why}>{why}</li>
                    ))}
                  </ul>
                  {aware ? (
                    <span className={styles.awareTag}>
                      Team already aware{aware.note ? ` — ${aware.note}` : ""}{aware.source === "slack" ? " (from Slack)" : ""}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={styles.drawerForm}>
          <label className={styles.field}>
            Project name
            <input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => name.trim() && name !== project.name && onUpdate({ name: name.trim() })} />
          </label>
          <label className={styles.field}>
            Purpose
            <textarea rows={2} maxLength={300} value={purpose} onChange={(event) => setPurpose(event.target.value)} onBlur={() => purpose.trim() && purpose !== project.purpose && onUpdate({ purpose: purpose.trim() })} />
          </label>
          <div className={styles.fieldPair}>
            <label className={styles.field}>
              Growth stage
              <select
                value={project.growthStage}
                onChange={(event) => {
                  const stage = event.target.value as GrowthStage;
                  if (stage === "Cancelled or replaced" && !reason) {
                    const entered = window.prompt("Why is this project being cancelled or replaced?");
                    if (!entered || !entered.trim()) return;
                    setReason(entered.trim());
                    onUpdate({ growthStage: stage, cancellationReason: entered.trim() });
                    return;
                  }
                  onUpdate({ growthStage: stage });
                }}
              >
                {GROWTH_STAGES.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Estimated completion
              <input
                type="date"
                value={project.estimatedCompletion ?? ""}
                onChange={(event) => onUpdate({ estimatedCompletion: event.target.value || null })}
              />
            </label>
          </div>

          {project.growthStage === "Testing or roll out" ? (
            <div className={styles.testingPanel}>
              <PeopleMulti
                label="Testing/Feedback owners"
                hint="The people actually carrying out testing or gathering feedback."
                value={project.testingOwners}
                people={workspace.people}
                onChange={(next) => onUpdate({ testingOwners: next })}
              />
              <TokenGrid label="Testing/Feedback teams" options={GARDEN_TEAMS} value={project.testingTeams} onChange={(next) => onUpdate({ testingTeams: next })} />
            </div>
          ) : null}

          {cancelled ? (
            <label className={styles.field}>
              Cancellation / replacement reason
              <input
                value={reason}
                maxLength={300}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => reason.trim() && reason !== project.cancellationReason && onUpdate({ cancellationReason: reason.trim() })}
              />
            </label>
          ) : null}

          <div className={styles.fieldPair}>
            <PersonSelect label="Owner" value={project.owner} people={workspace.people} required onChange={(person) => person && onUpdate({ owner: person })} />
            <PersonSelect label="Leadership sponsor" value={project.sponsor} people={workspace.people} onChange={(person) => onUpdate({ sponsor: person })} />
          </div>
          <PeopleMulti
            label="Project teammates"
            hint="People actively working on this project — not everyone affected by it."
            value={project.teammates}
            people={workspace.people}
            onChange={(next) => onUpdate({ teammates: next })}
          />
          <TokenGrid label="Teams impacted" options={GARDEN_TEAMS} value={project.teams} onChange={(next) => onUpdate({ teams: next })} />
          <TokenGrid label="Brands impacted" options={GARDEN_BRANDS} value={project.brands} onChange={(next) => onUpdate({ brands: next })} />
          <SystemsPicker value={project.systems} onChange={(next) => onUpdate({ systems: next })} />

          <div className={styles.fieldPair}>
            <label className={styles.field}>
              Quarter theme
              <select value={project.quarterTheme ?? ""} onChange={(event) => onUpdate({ quarterTheme: event.target.value || null })}>
                <option value="">Unthemed</option>
                {QUARTER_THEMES.map((theme) => (
                  <option key={theme}>{theme}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Project link
              <input
                type="url"
                placeholder="https://…"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                onBlur={() => (link.trim() || null) !== project.projectLink && onUpdate({ projectLink: link.trim() || null })}
              />
            </label>
          </div>
          <label className={styles.field}>
            Notes
            <textarea rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => notes !== project.notes && onUpdate({ notes })} />
          </label>

          <div className={styles.field}>
            <span>Related projects</span>
            {project.relatedProjectIds.length > 0 ? (
              <div className={styles.chipRow}>
                {project.relatedProjectIds.map((id) => {
                  const related = byId.get(id);
                  if (!related) return null;
                  return (
                    <span key={id} className={styles.personChip}>
                      {related.name}
                      <button type="button" aria-label={`Remove ${related.name}`} onClick={() => onUpdate({ relatedProjectIds: project.relatedProjectIds.filter((candidate) => candidate !== id) })}>
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
            <select
              value=""
              aria-label="Mark a related project"
              onChange={(event) => {
                if (event.target.value && !project.relatedProjectIds.includes(event.target.value)) {
                  onUpdate({ relatedProjectIds: [...project.relatedProjectIds, event.target.value] });
                }
                event.target.value = "";
              }}
            >
              <option value="">Mark a project as related…</option>
              {relatable.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>

          {project.projectLink ? (
            <a className={styles.projectLink} href={project.projectLink} target="_blank" rel="noreferrer">
              Open working doc ↗
            </a>
          ) : null}
        </div>

        <footer className={styles.drawerFooter}>
          {project.demoFields.length > 0 ? (
            <span className={styles.demoNote}>
              Demonstration values: {project.demoFields.map((field) => DEMO_FIELD_LABELS[field] ?? field).join(", ")}
            </span>
          ) : null}
          <span>
            Last modified: {formatStamp(project.lastEditedAt)}
            {project.lastEditedBy ? ` by ${project.lastEditedBy.name}` : ""}
          </span>
          <span>Created {formatStamp(project.createdAt)}{project.createdBy ? ` by ${project.createdBy.name}` : ""}</span>
        </footer>
      </aside>
    </div>
  );
}

// --- Create drawer --------------------------------------------------------------

function CreateDrawer({
  workspace,
  onClose,
  onCreate,
}: {
  workspace: GardenWorkspaceData;
  onClose: () => void;
  onCreate: (input: GardenProjectInput) => void;
}) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [owner, setOwner] = useState<PersonRef | null>(null);
  const [sponsor, setSponsor] = useState<PersonRef | null>(null);
  const [teammates, setTeammates] = useState<PersonRef[]>([]);
  const [stage, setStage] = useState<GrowthStage>("In Planning");
  const [completion, setCompletion] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [systems, setSystems] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [theme, setTheme] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [testingOwners, setTestingOwners] = useState<PersonRef[]>([]);
  const [testingTeams, setTestingTeams] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return setProblem("Give the project a name.");
    if (!purpose.trim()) return setProblem("Add a one-sentence purpose.");
    if (!owner) return setProblem("Choose an owner.");
    if (!sponsor) return setProblem("Choose a leadership sponsor.");
    if (!completion) return setProblem("Pick an estimated completion date.");
    if (teams.length === 0) return setProblem("Pick at least one team impacted.");
    if (stage === "Testing or roll out" && testingOwners.length === 0 && testingTeams.length === 0) {
      return setProblem("Testing projects need a Testing/Feedback owner.");
    }
    onCreate({
      name: name.trim(),
      purpose: purpose.trim(),
      owner,
      sponsor,
      teammates,
      growthStage: stage,
      estimatedCompletion: completion,
      teams: teams as GardenProjectInput["teams"],
      systems,
      brands: brands as GardenProjectInput["brands"],
      quarterTheme: theme || null,
      projectLink: link.trim() || null,
      notes: notes.trim(),
      cancellationReason: null,
      testingOwners,
      testingTeams: testingTeams as GardenProjectInput["testingTeams"],
      relatedProjectIds: [],
    });
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="garden-create-title">
        <header className={styles.drawerHeader}>
          <div>
            <span className={styles.panelKicker}>New Gardening project</span>
            <h2 id="garden-create-title">Plant a project</h2>
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className={styles.drawerForm}>
          <label className={styles.field}>
            Project name
            <input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mailvio rollout" autoFocus />
          </label>
          <label className={styles.field}>
            Purpose
            <textarea
              rows={2}
              maxLength={300}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="One sentence on what this improves."
            />
          </label>
          <div className={styles.fieldPair}>
            <PersonSelect label="Owner" value={owner} people={workspace.people} required onChange={setOwner} />
            <PersonSelect label="Leadership sponsor" value={sponsor} people={workspace.people} required onChange={setSponsor} />
          </div>
          <PeopleMulti
            label="Project teammates"
            hint="Optional — people actively working on it with the owner."
            value={teammates}
            people={workspace.people}
            onChange={setTeammates}
          />
          <div className={styles.fieldPair}>
            <label className={styles.field}>
              Growth stage
              <select value={stage} onChange={(event) => setStage(event.target.value as GrowthStage)}>
                {GROWTH_STAGES.filter((candidate) => candidate !== "Cancelled or replaced").map((candidate) => (
                  <option key={candidate}>{candidate}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Estimated completion
              <input type="date" value={completion} onChange={(event) => setCompletion(event.target.value)} />
            </label>
          </div>
          {stage === "Testing or roll out" ? (
            <div className={styles.testingPanel}>
              <PeopleMulti label="Testing/Feedback owners" value={testingOwners} people={workspace.people} onChange={setTestingOwners} />
              <TokenGrid label="Testing/Feedback teams" options={GARDEN_TEAMS} value={testingTeams} onChange={setTestingTeams} />
            </div>
          ) : null}
          <TokenGrid label="Teams impacted" options={GARDEN_TEAMS} value={teams} onChange={setTeams} />
          <TokenGrid label="Brands impacted" options={GARDEN_BRANDS} value={brands} onChange={setBrands} />
          <SystemsPicker value={systems} onChange={setSystems} />
          <div className={styles.fieldPair}>
            <label className={styles.field}>
              Quarter theme
              <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                <option value="">Unthemed</option>
                {QUARTER_THEMES.map((candidate) => (
                  <option key={candidate}>{candidate}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Project link
              <input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="Notion, Google Doc, Airtable…" />
            </label>
          </div>
          <label className={styles.field}>
            Notes
            <textarea rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Short notes only — the working doc lives at the link above." />
          </label>
          {problem ? <p className={styles.problem} role="alert">{problem}</p> : null}
        </div>
        <footer className={styles.createFooter}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} onClick={submit}>
            <PlusIcon /> Plant project
          </button>
        </footer>
      </aside>
    </div>
  );
}
