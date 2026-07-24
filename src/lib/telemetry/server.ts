import "server-only";

import type { ManagedAsset } from "@/lib/systems/model";
import { githubInventoryInstallationToken } from "@/lib/systems/sso-providers";
import { identityMode } from "@/lib/identity/server";
import { parseGitHubRepositoryInventory, type GitHubRepositoryInventory } from "./github-inventory";
import { parseGitHubTelemetry } from "./github-model";
import type { AssetTelemetry, GitHubTelemetry } from "./model";

const REPOSITORY_PATH = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function unconfigured(repositoryPath: string): GitHubTelemetry {
  return {
    state: "not_configured",
    repositoryPath,
    message: "A repository is registered, but read-only GitHub telemetry is not configured.",
  };
}

async function githubJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`GitHub request failed with HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

async function githubResourceExists(url: string, token: string): Promise<boolean | undefined> {
  const response = await fetch(url, {
    headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (response.ok) return true;
  if (response.status === 404) return false;
  return undefined;
}

async function githubReadToken() {
  const dedicatedToken = process.env.COVE_GITHUB_READ_TOKEN?.trim();
  if (dedicatedToken) return dedicatedToken;
  const appConfigured = Boolean(
    process.env.COVE_GITHUB_APP_ID?.trim() &&
    process.env.COVE_GITHUB_APP_INSTALLATION_ID?.trim() &&
    process.env.COVE_GITHUB_APP_PRIVATE_KEY?.trim(),
  );
  return appConfigured ? githubInventoryInstallationToken() : undefined;
}

export async function getGitHubRepositoryInventory(assets: readonly ManagedAsset[]): Promise<GitHubRepositoryInventory> {
  const organisation = process.env.COVE_GITHUB_ORG?.trim() || "leatherback-travel-organisation";
  if (identityMode() === "preview") {
    return {
      state: "not_configured",
      organisation,
      repositories: [],
      message: "Demonstration mode does not connect to the live GitHub organisation.",
    };
  }

  const token = await githubReadToken();
  if (!token) {
    return {
      state: "not_configured",
      organisation,
      repositories: [],
      message: "Connect a read-only GitHub credential to load the company repository inventory.",
    };
  }

  try {
    const repositoryPayloads: unknown[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const payload = await githubJson(
        `https://api.github.com/orgs/${encodeURIComponent(organisation)}/repos?type=all&sort=updated&direction=desc&per_page=100&page=${page}`,
        token,
      );
      if (!Array.isArray(payload)) throw new Error("GitHub returned an invalid repository list.");
      repositoryPayloads.push(...payload);
      if (payload.length < 100) break;
    }

    return parseGitHubRepositoryInventory({
      organisation,
      repositoryPayloads,
      assets,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return {
      state: "unavailable",
      organisation,
      repositories: [],
      message: "GitHub repositories could not be refreshed. Cove is not showing partial repository data.",
    };
  }
}

async function repositoryTelemetry(repositoryPath: string): Promise<GitHubTelemetry> {
  if (identityMode() === "preview") {
    return {
      state: "not_configured",
      repositoryPath,
      message: "Demonstration mode does not connect to live GitHub telemetry.",
    };
  }
  const token = await githubReadToken();
  if (!token) return unconfigured(repositoryPath);

  const match = REPOSITORY_PATH.exec(repositoryPath);
  if (!match) {
    return { state: "unavailable", repositoryPath, message: "The registered GitHub repository path is invalid." };
  }

  const encodedPath = `${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
  try {
    const repositoryPayload = await githubJson(`https://api.github.com/repos/${encodedPath}`, token);
    const repository = repositoryPayload as { default_branch?: unknown };
    if (typeof repository.default_branch !== "string" || !repository.default_branch) {
      throw new Error("GitHub did not return a default branch.");
    }

    let checkRunsPayload: unknown;
    let checksMessage: string | undefined;
    try {
      checkRunsPayload = await githubJson(
        `https://api.github.com/repos/${encodedPath}/commits/${encodeURIComponent(repository.default_branch)}/check-runs?per_page=100`,
        token,
      );
    } catch {
      checksMessage = "Repository metadata is available, but check runs could not be read.";
    }

    const [branchProtected, readmePresent, rootCodeowners, githubCodeowners, docsCodeowners] = await Promise.all([
      githubResourceExists(`https://api.github.com/repos/${encodedPath}/branches/${encodeURIComponent(repository.default_branch)}/protection`, token),
      githubResourceExists(`https://api.github.com/repos/${encodedPath}/readme`, token),
      githubResourceExists(`https://api.github.com/repos/${encodedPath}/contents/CODEOWNERS`, token),
      githubResourceExists(`https://api.github.com/repos/${encodedPath}/contents/.github/CODEOWNERS`, token),
      githubResourceExists(`https://api.github.com/repos/${encodedPath}/contents/docs/CODEOWNERS`, token),
    ]);
    const repositoryRecord = repositoryPayload as {
      security_and_analysis?: { secret_scanning?: { status?: unknown } };
    };
    const secretScanningStatus = repositoryRecord.security_and_analysis?.secret_scanning?.status;

    return {
      ...parseGitHubTelemetry({
      expectedRepositoryPath: repositoryPath,
      repositoryPayload,
      checkRunsPayload,
      checksMessage,
      fetchedAt: new Date().toISOString(),
      }),
      branchProtected,
      readmePresent,
      codeownersPresent: [rootCodeowners, githubCodeowners, docsCodeowners].some((present) => present === true)
        ? true
        : [rootCodeowners, githubCodeowners, docsCodeowners].every((present) => present === false)
          ? false
          : undefined,
      secretScanningEnabled: secretScanningStatus === "enabled" ? true : secretScanningStatus === "disabled" ? false : undefined,
    };
  } catch {
    return {
      state: "unavailable",
      repositoryPath,
      message: "GitHub telemetry could not be refreshed. No operational status is being inferred.",
    };
  }
}

export async function getAssetTelemetry(assets: readonly ManagedAsset[]): Promise<readonly AssetTelemetry[]> {
  return Promise.all(assets.map(async (asset) => {
    if (!asset.repository) {
      return {
        assetId: asset.id,
        github: { state: "not_applicable", message: "This managed asset has no source repository." },
        deployments: { state: "not_applicable", message: "Deployment telemetry does not apply to this managed asset." },
      } satisfies AssetTelemetry;
    }

    return {
      assetId: asset.id,
      github: await repositoryTelemetry(asset.repository.path),
      deployments: {
        state: "not_configured",
        message: "Vercel deployment telemetry is not configured. Production status is not being inferred from the launch URL.",
      },
    } satisfies AssetTelemetry;
  }));
}
