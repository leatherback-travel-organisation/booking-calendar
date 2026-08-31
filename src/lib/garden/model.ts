// The Garden domain model. Projects are visibility records, not delivery
// tools: people are directory references (Airtable stays canonical) and all
// scoring/lifecycle logic lives in pure functions so it can run identically
// against Postgres rows and the preview snapshot.

export const GROWTH_STAGES = [
  "In Planning",
  "Active work",
  "Testing or roll out",
  "Complete",
  "Cancelled or replaced",
] as const;

export type GrowthStage = (typeof GROWTH_STAGES)[number];

export const ACTIVE_STAGES: readonly GrowthStage[] = ["In Planning", "Active work", "Testing or roll out"];

export const GARDEN_TEAMS = [
  "Booking Managers",
  "DMC",
  "Finance",
  "HR & Hiring",
  "Leadership",
  "Marketing",
  "Operations",
  "Trip Design",
] as const;

export const GARDEN_BRANDS = [
  "Patch Adventures",
  "Camino Women",
  "Magnificent Rail",
  "Fencox Travel",
  "Carex Garden Tours",
  "Salt Caravan",
  "Harriet Adventures",
  "Magnificent Explorers",
] as const;

export const SYSTEM_GROUPS: readonly { group: string; systems: readonly string[] }[] = [
  {
    group: "Payments & Finance",
    systems: ["Airwallex", "Convera", "NAB Connect", "Stripe", "WeTravel - Carex", "WeTravel - Salemi Ceramics", "WeTravel - Salt Caravan", "Xero", "HubDoc"],
  },
  {
    group: "Comms & Support",
    systems: ["Aircall", "HelpScout - Adventure Brands", "HelpScout - Salemi Ceramics", "HelpScout - Trip Design", "Slack Workspace - Leatherback Travel", "Slack Workspace - Salemi Ceramics", "Talked", "It's Complicated"],
  },
  {
    group: "Marketing & Web",
    systems: ["Mailvio", "Canva", "Crazydomains", "Flamingo", "Flywheel/WP Engine", "Google Ads", "Google Analytics", "Google Business", "Google Postmaster", "Google Search Console", "Google Tag Manager", "Meta Ads and Accounts", "Namecheap", "Squarespace", "Stape", "Webflow", "Wordpress"],
  },
  {
    group: "Ops & Data",
    systems: ["Airtable - Daily Operations base", "Airtable - Hiring and Recruiting base", "Airtable - Leatherback Bookings and Data base", "Airtable - Salemi Ceramics Bookings and Data base", "Airtable - Team Operations/HR base", "Airtable - Trip Design base", "Databox", "Fillout", "Notion - Leatherback Travel", "Notion - Salemi Ceramics", "Payment Code and FAQ Extractor", "Stacker", "Zapier"],
  },
  { group: "HR & Hiring", systems: ["Infostud", "JobRack", "Upwork"] },
  { group: "Internal Workspace / IT", systems: ["Google Workspace"] },
];

export const GARDEN_SYSTEMS: readonly string[] = SYSTEM_GROUPS.flatMap((entry) => [...entry.systems]);

// Cross-cutting systems that never count as an overlap signal on their own.
export const COMMON_SYSTEMS: readonly string[] = ["Google Workspace"];

export const QUARTER_THEMES = ["Chop Chop", "Gnarly Oozes", "Animal Zoo"] as const;

export type PersonRef = {
  id: string | null;
  name: string;
  email: string | null;
};

export type GardenProject = {
  id: string;
  name: string;
  purpose: string;
  owner: PersonRef;
  sponsor: PersonRef | null;
  teammates: PersonRef[];
  growthStage: GrowthStage;
  estimatedCompletion: string | null;
  teams: string[];
  systems: string[];
  brands: string[];
  quarterTheme: string | null;
  projectLink: string | null;
  notes: string;
  cancellationReason: string | null;
  testingOwners: PersonRef[];
  testingTeams: string[];
  relatedProjectIds: string[];
  demoFields: string[];
  createdAt: string;
  createdBy: PersonRef | null;
  lastEditedAt: string;
  lastEditedBy: PersonRef | null;
  stageChangedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
};

export type AcknowledgementRecord = {
  projectId: string;
  personKey: string;
  personName: string;
  acknowledgedAt: string | null;
};

export function personKey(person: PersonRef): string {
  if (person.email) return person.email.trim().toLowerCase();
  if (person.id) return person.id;
  return `name:${person.name.trim().toLowerCase()}`;
}

export function samePerson(a: PersonRef, b: PersonRef): boolean {
  if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) return true;
  if (a.id && b.id && a.id === b.id) return true;
  return false;
}

function dedupePeople(people: PersonRef[]): PersonRef[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = personKey(person);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Everyone the spec counts as directly involved: Owner, Sponsor, Teammates and
// individual Testing/Feedback Owners. Teams Impacted members are deliberately
// excluded — affected is not involved.
export function involvedPeople(project: GardenProject): PersonRef[] {
  return dedupePeople([
    project.owner,
    ...(project.sponsor ? [project.sponsor] : []),
    ...project.teammates,
    ...project.testingOwners,
  ]);
}

// The people actively working on the project (owner + teammates) — the set the
// shared-person overlap rule cares about.
export function workingPeople(project: GardenProject): PersonRef[] {
  return dedupePeople([project.owner, ...project.teammates]);
}

export function isActiveStage(stage: GrowthStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

export function isLive(project: GardenProject): boolean {
  return project.archivedAt === null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPLETE_GRACE_DAYS = 30;
export const STALE_AFTER_DAYS = 90;

// Complete projects stay on the dashboard for a month, then archive.
export function isArchiveDue(project: GardenProject, now: Date): boolean {
  if (project.archivedAt) return false;
  if (project.growthStage === "Complete" && project.completedAt) {
    return now.getTime() - Date.parse(project.completedAt) > COMPLETE_GRACE_DAYS * DAY_MS;
  }
  return false;
}

export type StalenessFlag = "quiet" | "overdue" | null;

// Soft "could use an update" nudge: an active project untouched for ~3 months,
// or whose estimated completion passed with no edit since. Never a warning.
export function stalenessFlag(project: GardenProject, now: Date): StalenessFlag {
  if (!isActiveStage(project.growthStage) || project.archivedAt) return null;
  const lastEdited = Date.parse(project.lastEditedAt);
  if (project.estimatedCompletion) {
    const due = Date.parse(`${project.estimatedCompletion}T23:59:59Z`);
    if (due < now.getTime() && lastEdited < due) return "overdue";
  }
  if (now.getTime() - lastEdited > STALE_AFTER_DAYS * DAY_MS) return "quiet";
  return null;
}

export function stageChipTone(stage: GrowthStage): "planning" | "active" | "testing" | "complete" | "cancelled" {
  switch (stage) {
    case "In Planning":
      return "planning";
    case "Active work":
      return "active";
    case "Testing or roll out":
      return "testing";
    case "Complete":
      return "complete";
    case "Cancelled or replaced":
      return "cancelled";
  }
}
