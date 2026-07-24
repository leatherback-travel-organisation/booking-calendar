import type { NormalizedCoveApplicationReference } from "./core.js";

export type CoveTemplateFile = {
  path: string;
  mode: "create" | "create_or_merge" | "optional" | "example";
  content: string;
};
export type CoveAuthTemplate = {
  schema: "leatherback.cove-auth.template/v1";
  kitVersion: "1.0.0";
  application: NormalizedCoveApplicationReference;
  packageJsonPatch: { dependencies: { "@leatherback/cove-auth": "file:packages/cove-auth" } };
  environmentVariables: Array<{ name: string; visibility: string; source?: string; value?: string; required: boolean }>;
  files: CoveTemplateFile[];
  patches: Array<{ path: string; strategy: string; import?: string; before?: string; after?: string; note: string }>;
};
export function buildCoveAuthTemplate(input: { sourceRoot?: string; applicationId?: string; applicationSlug?: string; requestFileName?: "proxy.ts" | "middleware.ts" }): CoveAuthTemplate;
