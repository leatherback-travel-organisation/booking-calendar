// Conditional overlap scoring between active Gardening projects. V1 uses
// rules, not judgement: every flag carries the reasons that produced it, and
// nothing is ever blocked — the humans decide whether coordination is needed.

import {
  COMMON_SYSTEMS,
  isActiveStage,
  personKey,
  samePerson,
  workingPeople,
  type GardenProject,
  type PersonRef,
} from "./model.ts";

export type OverlapSeverity = "possible" | "material";

export type ProjectOverlap = {
  projectA: string;
  projectB: string;
  score: number;
  severity: OverlapSeverity;
  reasons: string[];
};

export type TestingConflict = {
  subject: string;
  subjectKind: "person" | "team";
  projectIds: string[];
};

// V1 thresholds — deliberately easy to adjust after real-world testing.
export const POSSIBLE_THRESHOLD = 3;
export const MATERIAL_THRESHOLD = 5;
const IMPLEMENTATION_WINDOW_DAYS = 45;

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const setB = new Set(b);
  return a.filter((value) => setB.has(value));
}

function listNames(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function sharedPeople(a: PersonRef[], b: PersonRef[]): PersonRef[] {
  return a.filter((person) => b.some((candidate) => samePerson(person, candidate)));
}

export function scorePair(a: GardenProject, b: GardenProject): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const specificSystemsA = a.systems.filter((system) => !COMMON_SYSTEMS.includes(system));
  const specificSystemsB = b.systems.filter((system) => !COMMON_SYSTEMS.includes(system));
  const sharedSystems = intersect(specificSystemsA, specificSystemsB);
  if (sharedSystems.length > 0) {
    score += 3;
    reasons.push(`Both change ${listNames(sharedSystems)}`);
  }

  const sharedTeams = intersect(a.teams, b.teams);
  const sharedBrands = intersect(a.brands, b.brands);

  const sameOwner = samePerson(a.owner, b.owner);
  if (sameOwner) {
    score += 2;
    reasons.push(`Same owner (${a.owner.name})`);
  }

  // A person actively working on both projects — owner or teammate on each —
  // beyond the same-owner signal already counted above.
  const shared = sharedPeople(workingPeople(a), workingPeople(b)).filter(
    (person) => !(sameOwner && samePerson(person, a.owner)),
  );
  if (shared.length > 0) {
    score += 2;
    reasons.push(`${listNames(shared.map((person) => person.name))} ${shared.length === 1 ? "is" : "are"} working on both`);
  }

  if (sharedTeams.length > 0 && sharedSystems.length > 0) {
    score += 3;
    reasons.push(`Both affect ${listNames(sharedTeams)} through the same system`);
  }

  if (sharedBrands.length > 0 && sharedSystems.length > 0) {
    score += 2;
    reasons.push(`Both affect ${listNames(sharedBrands)}`);
  }

  if (
    sharedTeams.length > 0 &&
    a.estimatedCompletion &&
    b.estimatedCompletion &&
    Math.abs(Date.parse(a.estimatedCompletion) - Date.parse(b.estimatedCompletion)) <=
      IMPLEMENTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ) {
    score += 2;
    reasons.push(`${listNames(sharedTeams)} ${sharedTeams.length === 1 ? "is" : "are"} in both implementation windows`);
  }

  const eitherTesting = a.growthStage === "Testing or roll out" || b.growthStage === "Testing or roll out";
  if (eitherTesting) {
    const sharedTesters = sharedPeople(a.testingOwners, b.testingOwners);
    const sharedTestingTeams = intersect(a.testingTeams, b.testingTeams);
    if (sharedTesters.length > 0 || sharedTestingTeams.length > 0) {
      score += 3;
      const names = [...sharedTesters.map((person) => person.name), ...sharedTestingTeams];
      reasons.push(`${listNames(names)} ${names.length === 1 ? "is" : "are"} testing both projects`);
    }
  }

  if (a.relatedProjectIds.includes(b.id) || b.relatedProjectIds.includes(a.id)) {
    score += 5;
    reasons.push("Marked as related projects");
  }

  return { score, reasons };
}

// Overlaps only exist between live projects in an active stage.
export function detectOverlaps(projects: GardenProject[]): ProjectOverlap[] {
  const active = projects.filter((project) => isActiveStage(project.growthStage) && project.archivedAt === null);
  const overlaps: ProjectOverlap[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const { score, reasons } = scorePair(active[i], active[j]);
      if (score < POSSIBLE_THRESHOLD) continue;
      overlaps.push({
        projectA: active[i].id,
        projectB: active[j].id,
        score,
        severity: score >= MATERIAL_THRESHOLD ? "material" : "possible",
        reasons,
      });
    }
  }
  return overlaps.sort((a, b) => b.score - a.score);
}

// A person or team assigned as Testing/Feedback Owner on two or more projects
// simultaneously in Testing or roll out. Awareness, not capacity planning.
export function detectTestingConflicts(projects: GardenProject[]): TestingConflict[] {
  const testing = projects.filter(
    (project) => project.growthStage === "Testing or roll out" && project.archivedAt === null,
  );
  const byPerson = new Map<string, { subject: string; projectIds: string[] }>();
  const byTeam = new Map<string, string[]>();

  for (const project of testing) {
    for (const person of project.testingOwners) {
      const key = personKey(person);
      const entry = byPerson.get(key) ?? { subject: person.name, projectIds: [] };
      entry.projectIds.push(project.id);
      byPerson.set(key, entry);
    }
    for (const team of project.testingTeams) {
      byTeam.set(team, [...(byTeam.get(team) ?? []), project.id]);
    }
  }

  const conflicts: TestingConflict[] = [];
  for (const entry of byPerson.values()) {
    if (entry.projectIds.length >= 2) {
      conflicts.push({ subject: entry.subject, subjectKind: "person", projectIds: entry.projectIds });
    }
  }
  for (const [team, projectIds] of byTeam.entries()) {
    if (projectIds.length >= 2) {
      conflicts.push({ subject: team, subjectKind: "team", projectIds });
    }
  }
  return conflicts;
}
