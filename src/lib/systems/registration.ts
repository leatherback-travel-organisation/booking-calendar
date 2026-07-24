import { z } from "zod";

const COMPANY_GITHUB_ORGANISATION = "leatherback-travel-organisation";
const UUID = z.string().uuid();

export type ExistingAssetRegistration = z.infer<typeof existingAssetRegistrationSchema>;
export type ManagedAssetProfileUpdate = z.infer<typeof managedAssetProfileUpdateSchema>;

const editableAssetFields = {
  name: z.string().trim().min(2, "Enter the name.").max(100),
  description: z.string().trim().min(5, "Add a short description.").max(500),
  productOwnerUserId: UUID,
  teamMemberUserIds: z.array(UUID).max(50),
  employeeAccessPolicy: z.enum(["selected", "all"]).default("selected"),
  risk: z.enum(["standard", "sensitive", "restricted"]),
  status: z.enum(["active", "maintenance", "retired"]).default("active"),
  repositoryUrl: z.string().trim().max(2_048).default(""),
  productionUrl: z.string().trim().max(2_048),
};

function validateEditableAssetFields(value: {
  productOwnerUserId: string;
  teamMemberUserIds: string[];
  repositoryUrl: string;
  productionUrl: string;
}, context: z.RefinementCtx) {
  if (new Set(value.teamMemberUserIds).size !== value.teamMemberUserIds.length) {
    context.addIssue({ code: "custom", path: ["teamMemberUserIds"], message: "A team member was selected more than once." });
  }
  if (value.teamMemberUserIds.includes(value.productOwnerUserId)) {
    context.addIssue({ code: "custom", path: ["teamMemberUserIds"], message: "The product owner is already included." });
  }
  if (value.repositoryUrl) {
    try { parseCompanyRepositoryUrl(value.repositoryUrl); }
    catch (error) { context.addIssue({ code: "custom", path: ["repositoryUrl"], message: error instanceof Error ? error.message : "Enter the private GitHub repository URL." }); }
  }
  try { parseProductionUrl(value.productionUrl); }
  catch (error) { context.addIssue({ code: "custom", path: ["productionUrl"], message: error instanceof Error ? error.message : "Enter the production URL." }); }
}

export const existingAssetRegistrationSchema = z.object({
  ...editableAssetFields,
  assetKind: z.enum(["application", "website"]),
  requestId: UUID,
}).superRefine((value, context) => {
  validateEditableAssetFields(value, context);
  if (value.assetKind === "website" && value.employeeAccessPolicy !== "selected") {
    context.addIssue({ code: "custom", path: ["employeeAccessPolicy"], message: "Websites do not use Cove application access policies." });
  }
});

export const managedAssetProfileUpdateSchema = z.object({
  ...editableAssetFields,
  assetId: UUID,
  requestId: UUID,
}).superRefine(validateEditableAssetFields);

export function assetSlug(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
  if (!slug) throw new Error("The name must contain letters or numbers.");
  return slug;
}

function safeUrl(value: string, message: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(message); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error(message);
  return url;
}

export function parseCompanyRepositoryUrl(value: string): { path: string; href: string } {
  const url = safeUrl(value, "Use the HTTPS URL for a private company GitHub repository.");
  const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  const [organisation, repository, ...extra] = path.split("/");
  if (url.hostname.toLowerCase() !== "github.com" || url.search || url.hash || extra.length > 0 || organisation?.toLowerCase() !== COMPANY_GITHUB_ORGANISATION || !repository || !/^[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Use a repository in the ${COMPANY_GITHUB_ORGANISATION} GitHub organisation.`);
  }
  const canonicalPath = `${COMPANY_GITHUB_ORGANISATION}/${repository}`;
  return { path: canonicalPath, href: `https://github.com/${canonicalPath}` };
}

export function parseProductionUrl(value: string): string {
  const url = safeUrl(value, "Use a secure HTTPS production URL.");
  url.hash = "";
  return url.toString();
}
