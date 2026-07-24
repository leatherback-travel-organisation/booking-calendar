import type { Application, EmployeeAccessPolicy } from "./model";

type RegistryRow = Readonly<Record<string, unknown>>;

const APPLICATION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GITHUB_REPOSITORY = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
const applicationStatuses = new Set<Application["status"]>(["active", "maintenance", "retired"]);
const applicationRisks = new Set<Application["risk"]>(["standard", "sensitive", "restricted"]);
const employeeAccessPolicies = new Set<EmployeeAccessPolicy>(["selected", "all"]);

function requiredText(row: RegistryRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Application registry field ${key} is invalid.`);
  }
  return value.trim();
}

function optionalText(row: RegistryRow, key: string): string | undefined {
  const value = row[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Application registry field ${key} is invalid.`);
  }
  return value.trim();
}

function databaseBoolean(value: unknown): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error("Application registry contains an invalid audience flag.");
}

function safeHttpsUrl(value: string, field: string): URL {
  if (value.length > 2_048) throw new Error(`Application registry field ${field} is too long.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Application registry field ${field} is not a valid URL.`);
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error(`Application registry field ${field} must be a credential-free HTTPS URL.`);
  }
  return url;
}

function repositoryFrom(row: RegistryRow): Application["repository"] {
  const path = optionalText(row, "repository_path");
  const href = optionalText(row, "repository_url");
  if (!path && !href) return undefined;
  if (!path || !href || !GITHUB_REPOSITORY.test(path)) {
    throw new Error("Application registry repository fields must be a complete GitHub owner/repository pair.");
  }

  const url = safeHttpsUrl(href, "repository_url");
  const pathname = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.search ||
    url.hash ||
    pathname.toLowerCase() !== path.toLowerCase()
  ) {
    throw new Error("Application registry repository URL does not match its GitHub repository path.");
  }

  return { path, href: `https://github.com/${path}` };
}

/**
 * Converts a database row into the only application shape allowed to reach
 * entitlement evaluation or browser-rendered links. Invalid rows fail closed.
 */
export function parseApplicationRegistryRow(row: RegistryRow): Application {
  const id = requiredText(row, "id");
  const slug = requiredText(row, "slug");
  const name = requiredText(row, "name");
  const owner = requiredText(row, "owner_name");
  const status = requiredText(row, "status") as Application["status"];
  const risk = requiredText(row, "risk") as Application["risk"];
  const rawEmployeeAccessPolicy = row.employee_access_policy;
  const employeeAccessPolicy = rawEmployeeAccessPolicy == null
    ? undefined
    : requiredText(row, "employee_access_policy") as EmployeeAccessPolicy;
  if (!APPLICATION_SLUG.test(slug)) throw new Error("Application registry slug is invalid.");
  if (!applicationStatuses.has(status)) throw new Error("Application registry status is invalid.");
  if (!applicationRisks.has(risk)) throw new Error("Application registry risk is invalid.");
  if (employeeAccessPolicy && !employeeAccessPolicies.has(employeeAccessPolicy)) {
    throw new Error("Application registry employee access policy is invalid.");
  }

  const allowedPopulations: Application["allowedPopulations"] = [
    ...(databaseBoolean(row.allows_employees) ? ["employee" as const] : []),
    ...(databaseBoolean(row.allows_external_partners) ? ["external_partner" as const] : []),
  ];
  if (allowedPopulations.length === 0) {
    throw new Error("Application registry must allow at least one identity population.");
  }

  return {
    id,
    slug,
    name,
    description: typeof row.description === "string" ? row.description.trim() : "",
    launchUrl: safeHttpsUrl(requiredText(row, "launch_url"), "launch_url").toString(),
    repository: repositoryFrom(row),
    owner,
    status,
    risk,
    allowedPopulations,
    employeeAccessPolicy,
  };
}

export function parseApplicationRegistry(rows: readonly RegistryRow[]): readonly Application[] {
  if (rows.length === 0) throw new Error("The application registry is empty.");
  const applications = rows.map(parseApplicationRegistryRow);
  if (new Set(applications.map((application) => application.id)).size !== applications.length) {
    throw new Error("The application registry contains duplicate IDs.");
  }
  if (new Set(applications.map((application) => application.slug)).size !== applications.length) {
    throw new Error("The application registry contains duplicate slugs.");
  }
  return applications;
}
