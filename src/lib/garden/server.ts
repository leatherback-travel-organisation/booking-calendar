import "server-only";

import { getDirectory } from "@/lib/airtable/server";
import { selectPersonalDetails } from "@/lib/airtable/personal-details";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";
import type { VerifiedIdentity } from "@/lib/identity/types";
import {
  isArchiveDue,
  overlapPairKey,
  personKey,
  type AcknowledgementRecord,
  type GardenProject,
  type GrowthStage,
  type PersonRef,
} from "./model.ts";
import { GARDEN_SEED_PROJECTS, NIC } from "./seed-data.ts";
import { timezonesByEmail } from "./attention.ts";

export type GardenPerson = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  team: string;
  initials: string;
};

export type GardenViewer = {
  name: string;
  email: string | null;
  // Every key this viewer can be recognised by in project person references.
  keys: string[];
};

export type GardenWorkspaceData = {
  projects: GardenProject[];
  acknowledgements: AcknowledgementRecord[];
  people: GardenPerson[];
  origin: "database" | "preview" | "unavailable";
  directoryOrigin: "airtable" | "database" | "preview" | "unavailable";
  viewer: GardenViewer;
  dismissedKeys: string[];
  awareness: OverlapAwareness[];
  timezoneByEmail: Record<string, string>;
  writesEnabled: boolean;
};

export type OverlapAwareness = { pairKey: string; source: string; note: string | null };

type ProjectRow = {
  id: string;
  name: string;
  purpose: string;
  owner: PersonRef;
  sponsor: PersonRef | null;
  teammates: PersonRef[];
  growth_stage: GrowthStage;
  estimated_completion: Date | string | null;
  teams: string[];
  systems: string[];
  brands: string[];
  quarter_theme: string | null;
  project_link: string | null;
  notes: string;
  cancellation_reason: string | null;
  testing_owners: PersonRef[];
  testing_teams: string[];
  related_project_ids: string[];
  demo_fields: string[];
  created_at: Date | string;
  created_by: PersonRef | null;
  last_edited_at: Date | string;
  last_edited_by: PersonRef | null;
  stage_changed_at: Date | string;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
  archived_at: Date | string | null;
};

// The neon driver hands timestamptz columns back as JS Dates and `date`
// columns as Dates parsed at LOCAL midnight; the domain model (and the zod
// schema round-trip) wants ISO strings, and slicing an ISO timestamp would
// shift the calendar day east of UTC — so format dates from local parts.
function isoStamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isoStampOrNull(value: Date | string | null): string | null {
  return value === null ? null : isoStamp(value);
}

function isoDateOrNull(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return value.slice(0, 10);
}

function projectFromRow(row: ProjectRow): GardenProject {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    owner: row.owner,
    sponsor: row.sponsor,
    teammates: row.teammates ?? [],
    growthStage: row.growth_stage,
    estimatedCompletion: isoDateOrNull(row.estimated_completion),
    teams: row.teams ?? [],
    systems: row.systems ?? [],
    brands: row.brands ?? [],
    quarterTheme: row.quarter_theme,
    projectLink: row.project_link,
    notes: row.notes,
    cancellationReason: row.cancellation_reason,
    testingOwners: row.testing_owners ?? [],
    testingTeams: row.testing_teams ?? [],
    relatedProjectIds: row.related_project_ids ?? [],
    demoFields: row.demo_fields ?? [],
    createdAt: isoStamp(row.created_at),
    createdBy: row.created_by,
    lastEditedAt: isoStamp(row.last_edited_at),
    lastEditedBy: row.last_edited_by,
    stageChangedAt: isoStamp(row.stage_changed_at),
    completedAt: isoStampOrNull(row.completed_at),
    cancelledAt: isoStampOrNull(row.cancelled_at),
    archivedAt: isoStampOrNull(row.archived_at),
  };
}

export async function loadProjects(): Promise<{ projects: GardenProject[]; origin: "database" | "preview" | "unavailable" }> {
  if (identityMode() === "preview") {
    return { projects: GARDEN_SEED_PROJECTS.map((project) => ({ ...project })), origin: "preview" };
  }
  if (!databaseConfigured()) {
    return { projects: [], origin: "unavailable" };
  }

  const sql = getSql();
  // Complete projects roll into the archive a month after completion.
  await sql`
    update garden.projects
    set archived_at = now()
    where archived_at is null
      and growth_stage = 'Complete'
      and completed_at is not null
      and completed_at < now() - interval '30 days'
  `;
  const rows = (await sql`select * from garden.projects order by last_edited_at desc`) as ProjectRow[];
  return { projects: rows.map(projectFromRow), origin: "database" };
}

async function loadAcknowledgements(origin: "database" | "preview" | "unavailable"): Promise<AcknowledgementRecord[]> {
  if (origin !== "database") return [];
  const sql = getSql();
  const rows = (await sql`
    select project_id, person_key, person_name, acknowledged_at from garden.acknowledgements
  `) as { project_id: string; person_key: string; person_name: string; acknowledged_at: Date | string | null }[];
  return rows.map((row) => ({
    projectId: row.project_id,
    personKey: row.person_key,
    personName: row.person_name,
    acknowledgedAt: isoStampOrNull(row.acknowledged_at),
  }));
}

// The projects live in Postgres; a flaky Airtable directory must degrade the
// people pickers, not take down the dashboard.
async function getDirectorySafely(): Promise<Awaited<ReturnType<typeof getDirectory>>> {
  try {
    return await getDirectory();
  } catch (error) {
    console.error("garden directory fetch failed", error);
    return { items: [], origin: "unavailable", integrityIssues: 0 };
  }
}

// Every key the identity can be recognised by in project person references:
// the verified login email plus, when the directory matches, the directory
// record id and company email.
export async function resolveViewerKeys(identity: VerifiedIdentity): Promise<{ name: string; email: string | null; keys: Set<string> }> {
  const directory = await getDirectorySafely();
  const email = identity.email?.trim().toLowerCase() ?? null;
  const match = email ? selectPersonalDetails(directory.items, email) : { state: "not_found" as const, profile: undefined };
  const keys = new Set<string>();
  if (email) keys.add(email);
  if (match.state === "matched" && match.profile) {
    keys.add(match.profile.id);
    if (match.profile.email) keys.add(match.profile.email.trim().toLowerCase());
  }
  return {
    name: match.state === "matched" && match.profile ? match.profile.name : identity.displayName,
    email,
    keys,
  };
}

export function personMatchesKeys(person: PersonRef, keys: Set<string>): boolean {
  if (person.email && keys.has(person.email.trim().toLowerCase())) return true;
  if (person.id && keys.has(person.id)) return true;
  return false;
}

export async function getGardenWorkspace(identity: VerifiedIdentity): Promise<GardenWorkspaceData> {
  const [directory, loaded] = await Promise.all([getDirectorySafely(), loadProjects()]);
  const acknowledgements = await loadAcknowledgements(loaded.origin);

  const people: GardenPerson[] = directory.items
    .map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email ?? null,
      role: person.role,
      team: person.team,
      initials: person.initials,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const email = identity.email?.trim().toLowerCase() ?? null;
  const match = email ? selectPersonalDetails(directory.items, email) : { state: "not_found" as const, profile: undefined };
  const keys = new Set<string>();
  if (email) keys.add(email);
  if (match.state === "matched" && match.profile) {
    keys.add(match.profile.id);
    if (match.profile.email) keys.add(match.profile.email.trim().toLowerCase());
  }
  // The demonstration account walks the Garden in Nic's shoes so personal
  // flags have something to show.
  if (identityMode() === "preview") keys.add(personKey(NIC));

  let awareness: OverlapAwareness[] = [];
  if (loaded.origin === "database") {
    try {
      const sql = getSql();
      const rows = (await sql`
        select project_a, project_b, source, note from garden.overlap_awareness
      `) as { project_a: string; project_b: string; source: string; note: string | null }[];
      awareness = rows.map((row) => ({ pairKey: overlapPairKey(row.project_a, row.project_b), source: row.source, note: row.note }));
    } catch (error) {
      console.error("garden awareness load failed", error);
    }
  }

  let timezoneByEmail: Record<string, string> = {};
  try {
    timezoneByEmail = Object.fromEntries(await timezonesByEmail());
  } catch (error) {
    console.error("garden timezone map failed", error);
  }

  let dismissedKeys: string[] = [];
  if (loaded.origin === "database" && keys.size > 0) {
    try {
      const sql = getSql();
      const rows = (await sql`
        select item_key from garden.attention_dismissals where person_key = any(${[...keys]})
      `) as { item_key: string }[];
      dismissedKeys = rows.map((row) => row.item_key);
    } catch (error) {
      console.error("garden dismissals load failed", error);
    }
  }

  return {
    projects: loaded.projects,
    acknowledgements,
    people,
    origin: loaded.origin,
    directoryOrigin: directory.origin,
    viewer: {
      name: match.state === "matched" && match.profile ? match.profile.name : identity.displayName,
      email,
      keys: [...keys],
    },
    dismissedKeys,
    awareness,
    timezoneByEmail,
    writesEnabled: loaded.origin === "database",
  };
}

export function archiveDue(projects: GardenProject[], now: Date): GardenProject[] {
  return projects.filter((project) => isArchiveDue(project, now));
}
