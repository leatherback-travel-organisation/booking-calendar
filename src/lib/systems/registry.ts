import { z } from "zod";
import type { ManagedAsset } from "./model";

type Row = Readonly<Record<string, unknown>>;
const uuid = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const assetKinds = new Set<ManagedAsset["assetKind"]>(["application", "website"]);
const risks = new Set<ManagedAsset["risk"]>(["standard", "sensitive", "restricted"]);
const statuses = new Set<ManagedAsset["status"]>(["active", "maintenance", "retired"]);
const employeeAccessPolicies = new Set<ManagedAsset["employeeAccessPolicy"]>(["selected", "all"]);

function requiredText(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Managed asset field ${key} is invalid.`);
  return value.trim();
}

function optionalText(row: Row, key: string): string | undefined {
  const value = row[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`Managed asset field ${key} is invalid.`);
  return value.trim();
}

function optionalTimestamp(row: Row, key: string): string | undefined {
  const value = row[key];
  if (value == null || value === "") return undefined;
  const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) throw new Error(`Managed asset field ${key} is invalid.`);
  return parsed.toISOString();
}

function safeHttps(value: string, field: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Managed asset field ${field} is not a valid URL.`); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error(`Managed asset field ${field} must be credential-free HTTPS.`);
  return url.toString();
}

function repository(row: Row): ManagedAsset["repository"] {
  const path = optionalText(row, "repository_path");
  const href = optionalText(row, "repository_url");
  if (!path && !href) return undefined;
  if (!path || !href || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(path)) throw new Error("Managed asset repository is incomplete.");
  const canonical = safeHttps(href, "repository_url");
  const url = new URL(canonical);
  const urlPath = url.pathname.replace(/^\/+|\/+$/g, "");
  if (url.hostname.toLowerCase() !== "github.com" || urlPath.toLowerCase() !== path.toLowerCase()) throw new Error("Managed asset repository URL does not match its path.");
  return { path, href: `https://github.com/${path}` };
}

export function parseManagedAssetRow(row: Row): ManagedAsset {
  const assetKind = requiredText(row, "asset_kind") as ManagedAsset["assetKind"];
  const risk = requiredText(row, "risk") as ManagedAsset["risk"];
  const status = requiredText(row, "status") as ManagedAsset["status"];
  const applicationId = optionalText(row, "application_id");
  const employeeAccessPolicy = (optionalText(row, "employee_access_policy") ?? "selected") as ManagedAsset["employeeAccessPolicy"];
  if (!assetKinds.has(assetKind) || !risks.has(risk) || !statuses.has(status)) throw new Error("Managed asset policy fields are invalid.");
  if (!employeeAccessPolicies.has(employeeAccessPolicy)) throw new Error("Managed asset employee access policy is invalid.");
  if (assetKind === "website" && employeeAccessPolicy !== "selected") throw new Error("Managed websites cannot carry an application access policy.");
  if ((assetKind === "application") !== Boolean(applicationId)) throw new Error("Managed application linkage is invalid.");
  if (applicationId) uuid.parse(applicationId);
  const parsedSlug = slug.parse(requiredText(row, "slug"));
  const ownerUserId = optionalText(row, "product_owner_user_id");
  if (ownerUserId) uuid.parse(ownerUserId);
  const memberUserIds = z.array(uuid).parse(row.member_user_ids ?? []);
  return {
    id: uuid.parse(requiredText(row, "id")),
    assetKind,
    applicationId,
    slug: parsedSlug,
    name: requiredText(row, "name"),
    description: typeof row.description === "string" ? row.description.trim() : "",
    productOwnerUserId: ownerUserId,
    productOwnerName: optionalText(row, "product_owner_name") ?? "Ownership required",
    memberUserIds,
    repository: repository(row),
    productionUrl: safeHttps(requiredText(row, "production_url"), "production_url"),
    vercelProjectId: optionalText(row, "vercel_project_id"),
    risk,
    status,
    employeeAccessPolicy,
    createdAt: optionalTimestamp(row, "created_at"),
    updatedAt: optionalTimestamp(row, "updated_at"),
  };
}

export function parseManagedAssetRows(rows: readonly Row[]): readonly ManagedAsset[] {
  const assets = rows.map(parseManagedAssetRow);
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) throw new Error("Managed assets contain duplicate IDs.");
  if (new Set(assets.map((asset) => asset.slug)).size !== assets.length) throw new Error("Managed assets contain duplicate slugs.");
  return assets;
}
