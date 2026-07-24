import "server-only";

import { createSign } from "node:crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const VERCEL_API = "https://api.vercel.com";
const VERCEL_TEAM_ID = "team_bCUUoKPj3tAnwhOT5OvDgQwM";
const COVE_PRIMARY_URL = "https://cove.leatherbacktravel.com";

export class ProviderSetupRequiredError extends Error {
  readonly provider: "clerk" | "github" | "vercel";

  constructor(provider: ProviderSetupRequiredError["provider"], message: string) {
    super(message);
    this.name = "ProviderSetupRequiredError";
    this.provider = provider;
  }
}

export class ProviderOperationError extends Error {
  readonly provider: "clerk" | "github" | "vercel";

  constructor(provider: ProviderOperationError["provider"], message: string) {
    super(message);
    this.name = "ProviderOperationError";
    this.provider = provider;
  }
}

function productionClerkSecretKey() {
  const value = process.env.CLERK_SECRET_KEY?.trim();
  if (!value?.startsWith("sk_live_")) {
    throw new ProviderSetupRequiredError(
      "clerk",
      "Replace Cove's Clerk test credential with the production instance secret key before registering or configuring Sub-Apps.",
    );
  }
  return value;
}

function productionClerkPublishableKey() {
  const value = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!value?.startsWith("pk_live_")) {
    throw new ProviderSetupRequiredError(
      "clerk",
      "Replace Cove's Clerk test credential with the production instance publishable key before configuring Sub-Apps.",
    );
  }
  return value;
}

type GitHubRepository = { readonly owner: string; readonly name: string };

function repositoryParts(path: string): GitHubRepository {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(path);
  if (!match) throw new ProviderOperationError("github", "The registered GitHub repository path is invalid.");
  return { owner: match[1], name: match[2] };
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function githubAppJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey.replaceAll("\\n", "\n"));
  return `${signingInput}.${base64url(signature)}`;
}

function safeProviderMessage(provider: string, status: number, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const raw = typeof record.message === "string" ? record.message : `${provider} returned HTTP ${status}.`;
  return raw.replace(/(?:ghs|ghp|github_pat|sk_live|sk_test)_[A-Za-z0-9_\-]+/g, "[redacted]").slice(0, 400);
}

async function githubRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ProviderOperationError("github", safeProviderMessage("GitHub", response.status, payload));
  return payload as T;
}

async function githubInstallationToken(repository: GitHubRepository) {
  const appId = process.env.COVE_GITHUB_APP_ID?.trim();
  const installationId = process.env.COVE_GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKey = process.env.COVE_GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !installationId || !privateKey) {
    throw new ProviderSetupRequiredError(
      "github",
      "Install the Cove GitHub App with Contents and Pull requests write access, then add its App ID, installation ID and private key to Cove.",
    );
  }
  const jwt = githubAppJwt(appId, privateKey);
  const result = await githubRequest<{ token?: unknown }>(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, jwt, {
    method: "POST",
    body: JSON.stringify({
      repositories: [repository.name],
      permissions: { contents: "write", pull_requests: "write", metadata: "read", checks: "read" },
    }),
  });
  if (typeof result.token !== "string" || !result.token) {
    throw new ProviderOperationError("github", "GitHub did not issue a repository-scoped installation token.");
  }
  return result.token;
}

/**
 * Issues a short-lived token for read-only inventory requests across every
 * repository already granted to the Cove GitHub App installation.
 *
 * The inventory caller only performs GET requests. Keeping token creation in
 * the GitHub App boundary avoids requiring a separate long-lived personal
 * access token when the installation is already configured.
 */
export async function githubInventoryInstallationToken() {
  const appId = process.env.COVE_GITHUB_APP_ID?.trim();
  const installationId = process.env.COVE_GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKey = process.env.COVE_GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !installationId || !privateKey) {
    throw new ProviderSetupRequiredError(
      "github",
      "Install the Cove GitHub App, then add its App ID, installation ID and private key to Cove.",
    );
  }
  const jwt = githubAppJwt(appId, privateKey);
  const result = await githubRequest<{ token?: unknown }>(`/app/installations/${encodeURIComponent(installationId)}/access_tokens`, jwt, {
    method: "POST",
  });
  if (typeof result.token !== "string" || !result.token) {
    throw new ProviderOperationError("github", "GitHub did not issue an installation token for repository inventory.");
  }
  return result.token;
}

async function githubTextFile(root: string, path: string, token: string): Promise<string | null> {
  const response = await fetch(`${GITHUB_API}${root}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": GITHUB_API_VERSION },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null) as { content?: unknown; encoding?: unknown; message?: unknown } | null;
  if (!response.ok) throw new ProviderOperationError("github", safeProviderMessage("GitHub", response.status, payload));
  if (!payload || payload.encoding !== "base64" || typeof payload.content !== "string") {
    throw new ProviderOperationError("github", `GitHub returned an unreadable ${path} file.`);
  }
  return Buffer.from(payload.content.replaceAll("\n", ""), "base64").toString("utf8");
}

export type GitHubNextApplicationSource = {
  readonly packageJson: string;
  readonly packageLockJson: string | null;
  readonly sourceRoot: "src" | "";
  readonly layoutPath: string;
  readonly layout: string;
  readonly proxyPath: string;
  readonly proxy: string | null;
};

function nextRequestFileName(packageJson: string): "proxy.ts" | "middleware.ts" {
  try {
    const parsed = JSON.parse(packageJson) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    const declared = parsed.dependencies?.next ?? parsed.devDependencies?.next;
    const major = typeof declared === "string" ? Number(declared.match(/\d+/)?.[0]) : Number.NaN;
    return Number.isFinite(major) && major < 16 ? "middleware.ts" : "proxy.ts";
  } catch {
    throw new ProviderOperationError("github", "The repository package.json is not valid JSON.");
  }
}

export async function inspectGitHubNextApplication(repositoryPath: string): Promise<GitHubNextApplicationSource> {
  const repository = repositoryParts(repositoryPath);
  const token = await githubInstallationToken(repository);
  const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const packageJson = await githubTextFile(root, "package.json", token);
  if (!packageJson) throw new ProviderOperationError("github", "The repository does not contain a root package.json.");
  const packageLockJson = await githubTextFile(root, "package-lock.json", token);
  const srcLayout = await githubTextFile(root, "src/app/layout.tsx", token);
  const rootLayout = srcLayout === null ? await githubTextFile(root, "app/layout.tsx", token) : null;
  const sourceRoot = srcLayout !== null ? "src" : "";
  const layout = srcLayout ?? rootLayout;
  if (!layout) throw new ProviderOperationError("github", "The repository is not a supported Next.js App Router project; app/layout.tsx is missing.");
  const layoutPath = sourceRoot ? "src/app/layout.tsx" : "app/layout.tsx";
  const preferredFileName = nextRequestFileName(packageJson);
  const alternateFileName = preferredFileName === "proxy.ts" ? "middleware.ts" : "proxy.ts";
  const preferredPath = sourceRoot ? `${sourceRoot}/${preferredFileName}` : preferredFileName;
  const alternatePath = sourceRoot ? `${sourceRoot}/${alternateFileName}` : alternateFileName;
  const preferred = await githubTextFile(root, preferredPath, token);
  const alternate = preferred === null ? await githubTextFile(root, alternatePath, token) : null;
  const proxyPath = alternate === null ? preferredPath : alternatePath;
  const proxy = preferred ?? alternate;
  return { packageJson, packageLockJson, sourceRoot, layoutPath, layout, proxyPath, proxy };
}

export type PreparedPullRequest = {
  readonly repositoryId: string;
  readonly number: number;
  readonly url: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly commitSha: string;
};

export async function prepareGitHubPullRequest(input: {
  readonly repositoryPath: string;
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  readonly files: Readonly<Record<string, string>>;
}): Promise<PreparedPullRequest> {
  const repository = repositoryParts(input.repositoryPath);
  const token = await githubInstallationToken(repository);
  const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const metadata = await githubRequest<{ default_branch?: unknown; node_id?: unknown }>(root, token);
  if (typeof metadata.default_branch !== "string" || !metadata.default_branch) {
    throw new ProviderOperationError("github", "GitHub did not return the repository's default branch.");
  }
  if (typeof metadata.node_id !== "string" || !metadata.node_id) {
    throw new ProviderOperationError("github", "GitHub did not return the canonical repository identifier.");
  }
  const baseBranch = metadata.default_branch;
  const encodedBranch = encodeURIComponent(input.branch);

  const existingRefResponse = await fetch(`${GITHUB_API}${root}/git/ref/heads/${encodedBranch}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": GITHUB_API_VERSION },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (existingRefResponse.ok) {
    const pulls = await githubRequest<Array<{ number?: unknown; node_id?: unknown; html_url?: unknown; head?: { sha?: unknown } }>>(
      `${root}/pulls?state=open&head=${encodeURIComponent(`${repository.owner}:${input.branch}`)}`,
      token,
    );
    const existing = pulls[0];
    if (existing && typeof existing.number === "number" && typeof existing.node_id === "string" && typeof existing.html_url === "string" && typeof existing.head?.sha === "string") {
      return { repositoryId: metadata.node_id, number: existing.number, url: existing.html_url, branch: input.branch, baseBranch, commitSha: existing.head.sha };
    }
    throw new ProviderOperationError("github", "The Cove authentication branch already exists without an open pull request. Remove it or ask Matthew to review it before preparing again.");
  }
  if (existingRefResponse.status !== 404) {
    const payload = await existingRefResponse.json().catch(() => null);
    throw new ProviderOperationError("github", safeProviderMessage("GitHub", existingRefResponse.status, payload));
  }

  const baseRef = await githubRequest<{ object?: { sha?: unknown } }>(`${root}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token);
  const baseSha = baseRef.object?.sha;
  if (typeof baseSha !== "string") throw new ProviderOperationError("github", "GitHub did not return the default branch commit.");
  const baseCommit = await githubRequest<{ tree?: { sha?: unknown } }>(`${root}/git/commits/${encodeURIComponent(baseSha)}`, token);
  const baseTree = baseCommit.tree?.sha;
  if (typeof baseTree !== "string") throw new ProviderOperationError("github", "GitHub did not return the default branch tree.");

  const tree = await githubRequest<{ sha?: unknown }>(`${root}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTree,
      tree: Object.entries(input.files).map(([path, content]) => ({ path, mode: "100644", type: "blob", content })),
    }),
  });
  if (typeof tree.sha !== "string") throw new ProviderOperationError("github", "GitHub did not create the Cove authentication file tree.");
  const commit = await githubRequest<{ sha?: unknown }>(`${root}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message: input.title, tree: tree.sha, parents: [baseSha] }),
  });
  if (typeof commit.sha !== "string") throw new ProviderOperationError("github", "GitHub did not create the Cove authentication commit.");
  await githubRequest(`${root}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: commit.sha }),
  });
  const pull = await githubRequest<{ number?: unknown; node_id?: unknown; html_url?: unknown }>(`${root}/pulls`, token, {
    method: "POST",
    body: JSON.stringify({ title: input.title, head: input.branch, base: baseBranch, body: input.body, draft: true }),
  });
  if (typeof pull.number !== "number" || typeof pull.node_id !== "string" || typeof pull.html_url !== "string") {
    throw new ProviderOperationError("github", "GitHub created an incomplete pull request record.");
  }
  return { repositoryId: metadata.node_id, number: pull.number, url: pull.html_url, branch: input.branch, baseBranch, commitSha: commit.sha };
}

export type PullRequestChecks = {
  readonly state: "open" | "closed";
  readonly merged: boolean;
  readonly total: number;
  readonly passing: number;
  readonly failing: number;
  readonly pending: number;
  readonly headSha: string;
};

export async function getPullRequestChecks(repositoryPath: string, pullNumber: number): Promise<PullRequestChecks> {
  const repository = repositoryParts(repositoryPath);
  const token = await githubInstallationToken(repository);
  const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const pull = await githubRequest<{ state?: unknown; merged?: unknown; head?: { sha?: unknown } }>(`${root}/pulls/${pullNumber}`, token);
  if ((pull.state !== "open" && pull.state !== "closed") || typeof pull.merged !== "boolean" || typeof pull.head?.sha !== "string") {
    throw new ProviderOperationError("github", "GitHub returned an invalid pull request status.");
  }
  const checks = await githubRequest<{ check_runs?: unknown }>(`${root}/commits/${encodeURIComponent(pull.head.sha)}/check-runs?per_page=100`, token);
  if (!Array.isArray(checks.check_runs)) throw new ProviderOperationError("github", "GitHub did not return check-run evidence.");
  const conclusions = checks.check_runs.map((item) => item && typeof item === "object" ? item as { status?: unknown; conclusion?: unknown } : {});
  const pending = conclusions.filter((check) => check.status !== "completed").length;
  const passing = conclusions.filter((check) => check.status === "completed" && ["success", "neutral", "skipped"].includes(String(check.conclusion))).length;
  const failing = conclusions.length - pending - passing;
  return { state: pull.state, merged: pull.merged, total: conclusions.length, passing, failing, pending, headSha: pull.head.sha };
}

export async function approveAndMergePullRequest(input: {
  readonly repositoryPath: string;
  readonly pullNumber: number;
  readonly commitTitle: string;
}) {
  const repository = repositoryParts(input.repositoryPath);
  const token = await githubInstallationToken(repository);
  const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const pull = await githubRequest<{ node_id?: unknown }>(`${root}/pulls/${input.pullNumber}`, token);
  if (typeof pull.node_id !== "string" || !pull.node_id) {
    throw new ProviderOperationError("github", "GitHub did not return the pull request approval identifier.");
  }
  const ready = await githubRequest<{ data?: unknown; errors?: unknown }>("/graphql", token, {
    method: "POST",
    body: JSON.stringify({
      query: "mutation MarkReady($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { id } } }",
      variables: { id: pull.node_id },
    }),
  });
  if (Array.isArray(ready.errors) && ready.errors.length > 0) {
    throw new ProviderOperationError("github", "GitHub could not move the approved pull request out of draft.");
  }
  const merged = await githubRequest<{ merged?: unknown; message?: unknown; sha?: unknown }>(`${root}/pulls/${input.pullNumber}/merge`, token, {
    method: "PUT",
    body: JSON.stringify({ commit_title: input.commitTitle, merge_method: "squash" }),
  });
  if (merged.merged !== true) throw new ProviderOperationError("github", typeof merged.message === "string" ? merged.message : "GitHub did not merge the approved pull request.");
  if (typeof merged.sha !== "string" || !/^[0-9a-f]{40,64}$/.test(merged.sha)) {
    throw new ProviderOperationError("github", "GitHub merged the pull request without returning the deployed commit identifier.");
  }
  return { commitSha: merged.sha };
}

export async function registerClerkSatelliteDomain(hostname: string) {
  productionClerkSecretKey();
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const domains = await client.domains.list();
    const existing = domains.data.find((domain) => domain.name.toLowerCase() === hostname.toLowerCase());
    if (existing) {
      if (!existing.isSatellite) throw new ProviderOperationError("clerk", "This hostname is already registered as a non-satellite Clerk domain.");
      return { domainId: existing.id, instanceId: new URL(existing.frontendApiUrl).hostname, created: false };
    }
    const created = await client.domains.add({ name: hostname, is_satellite: true });
    return { domainId: created.id, instanceId: new URL(created.frontendApiUrl).hostname, created: true };
  } catch (error) {
    if (error instanceof ProviderOperationError) throw error;
    const message = error instanceof Error ? error.message : "Clerk could not register the satellite domain.";
    throw new ProviderOperationError("clerk", message.slice(0, 400));
  }
}

async function vercelRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${VERCEL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ProviderOperationError("vercel", safeProviderMessage("Vercel", response.status, payload));
  return payload as T;
}

export async function configureVercelSatelliteEnvironment(input: {
  readonly hostname: string;
  readonly applicationId: string;
  readonly applicationSlug: string;
  readonly knownProjectId?: string;
}) {
  const token = process.env.COVE_VERCEL_API_TOKEN?.trim();
  if (!token) throw new ProviderSetupRequiredError("vercel", "Add a scoped Vercel access token to Cove so SuperPanel can configure the Sub-App project.");
  const publishableKey = productionClerkPublishableKey();
  const secretKey = productionClerkSecretKey();

  let projectId = input.knownProjectId;
  if (!projectId) {
    const deployment = await vercelRequest<{ projectId?: unknown }>(`/v13/deployments/${encodeURIComponent(input.hostname)}?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`, token);
    if (typeof deployment.projectId !== "string" || !deployment.projectId) {
      throw new ProviderOperationError("vercel", "Vercel did not return the project linked to this production hostname.");
    }
    projectId = deployment.projectId;
  }
  const env = [
    { key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", value: publishableKey, type: "plain", target: ["production"] },
    { key: "CLERK_SECRET_KEY", value: secretKey, type: "sensitive", target: ["production"] },
    { key: "NEXT_PUBLIC_CLERK_IS_SATELLITE", value: "true", type: "plain", target: ["production"] },
    { key: "NEXT_PUBLIC_CLERK_DOMAIN", value: input.hostname, type: "plain", target: ["production"] },
    { key: "NEXT_PUBLIC_CLERK_SIGN_IN_URL", value: `${COVE_PRIMARY_URL}/sign-in`, type: "plain", target: ["production"] },
    { key: "NEXT_PUBLIC_CLERK_SIGN_UP_URL", value: `${COVE_PRIMARY_URL}/sign-in`, type: "plain", target: ["production"] },
    { key: "NEXT_PUBLIC_COVE_PRIMARY_URL", value: COVE_PRIMARY_URL, type: "plain", target: ["production"] },
    { key: "COVE_PRIMARY_URL", value: COVE_PRIMARY_URL, type: "plain", target: ["production"] },
    { key: "COVE_APPLICATION_ID", value: input.applicationId, type: "plain", target: ["production"] },
    { key: "COVE_APPLICATION_SLUG", value: input.applicationSlug, type: "plain", target: ["production"] },
  ];
  await vercelRequest(`/v10/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}&upsert=true`, token, {
    method: "POST",
    body: JSON.stringify(env),
  });
  const listed = await vercelRequest<{ envs?: unknown }>(`/v9/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`, token);
  if (!Array.isArray(listed.envs)) throw new ProviderOperationError("vercel", "Vercel did not return environment verification evidence.");
  const keys = new Set(listed.envs.flatMap((item) => item && typeof item === "object" && typeof (item as { key?: unknown }).key === "string" ? [(item as { key: string }).key] : []));
  const configuredKeys = env.map((item) => item.key);
  const missingKeys = configuredKeys.filter((key) => !keys.has(key));
  if (missingKeys.length > 0) throw new ProviderOperationError("vercel", `Vercel did not confirm ${missingKeys.length} required environment setting${missingKeys.length === 1 ? "" : "s"}.`);
  return { projectId, configuredKeys };
}

export function ssoProviderSetup() {
  return {
    clerk: Boolean(
      process.env.CLERK_SECRET_KEY?.trim().startsWith("sk_live_") &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim().startsWith("pk_live_"),
    ),
    github: Boolean(process.env.COVE_GITHUB_APP_ID && process.env.COVE_GITHUB_APP_INSTALLATION_ID && process.env.COVE_GITHUB_APP_PRIVATE_KEY),
    vercel: Boolean(process.env.COVE_VERCEL_API_TOKEN),
  };
}
