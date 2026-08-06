// Briefs upload directly to private Blob storage, bypassing Vercel Functions'
// 4.5 MB request-body ceiling. 200 MB supports image-heavy team briefs while
// remaining comfortably inside the upstream file service's supported range.
export const APP_BUILDER_MAX_PDF_BYTES = 200 * 1024 * 1024;

const APP_BUILDER_BRIEF_PATH = /^app-builder\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[A-Za-z0-9]{20,})?\.pdf$/i;

export function isAppBuilderBriefPath(pathname: string) {
  return APP_BUILDER_BRIEF_PATH.test(pathname);
}

export const appBuilderStatuses = [
  "queued", "reading", "waiting_openai", "making_changes",
  "preparing_review", "needs_approval", "publishing", "live",
  "reversing", "reversed", "failed",
] as const;

export type AppBuilderStatus = (typeof appBuilderStatuses)[number];

type AppBuilderTargetBase = {
  id: string;
  applicationId: string;
  slug: string;
  name: string;
  description: string;
  productionUrl: string;
};

export type AppBuilderTarget = AppBuilderTargetBase & (
  | {
      readiness: "ready";
      repositorySource: "standalone" | "cove";
      executionAssetId: string;
      repositoryPath: string;
    }
  | {
      readiness: "setup_required";
      repositorySource: "missing";
      executionAssetId?: never;
      repositoryPath?: never;
    }
);

export type AppBuilderRequest = {
  id: string;
  targetAssetId: string;
  targetApplicationId: string;
  targetSlug: string;
  targetName: string;
  repositoryPath: string;
  productionUrl: string;
  requestedByName: string;
  filename: string;
  notes: string;
  status: AppBuilderStatus;
  statusDetail: string;
  responseId?: string;
  turn: number;
  branch?: string;
  pullNumber?: number;
  pullUrl?: string;
  publishedCommitSha?: string;
  reversalPullNumber?: number;
  reversalPullUrl?: string;
  reversedCommitSha?: string;
  reversedAt?: string;
  summary?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export function validPdfUpload(input: { name: string; type: string; size: number; signature: Uint8Array }) {
  if (input.type !== "application/pdf" || !input.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are accepted.";
  if (input.size < 5 || input.size > APP_BUILDER_MAX_PDF_BYTES) return "Choose a PDF between 5 bytes and 200 MB.";
  if (new TextDecoder().decode(input.signature) !== "%PDF-") return "This file does not appear to be a valid PDF.";
  return null;
}

export function safeRepositoryPath(path: string) {
  const clean = path.replace(/^\/+/, "");
  if (!clean || clean.includes("..") || !/^[A-Za-z0-9_.\-/]+$/.test(clean)) throw new Error("The repository path is invalid.");
  return clean;
}

export function assertWritablePath(path: string) {
  const normalized = `/${path.toLowerCase()}`;
  const blocked = [
    "/.env", "/.github/", "/db/", "/drizzle/", "/migrations/",
    "/package-lock.json", "/pnpm-lock.yaml", "/yarn.lock", "/vercel.json",
    "/proxy.ts", "/middleware.ts", "/scripts/deploy", "/api/auth/",
    "/lib/auth/", "/lib/identity/", "/lib/access/", "/payments/", "/billing/",
  ];
  if (blocked.some((item) => normalized === item || normalized.startsWith(item) || normalized.includes(item))) {
    throw new Error(`${path} is protected and requires a human-led change.`);
  }
}
