import "server-only";

import { identityMode } from "@/lib/identity/server";
import type { ManagedAsset } from "@/lib/systems/model";
import type {
  AssetTelemetry,
  AssetHygiene,
  HygieneCheck,
  HygieneCheckStatus,
} from "./model";

function check(
  key: string,
  label: string,
  status: HygieneCheckStatus,
  evidence: string,
  owner: HygieneCheck["owner"],
): HygieneCheck {
  return { key, label, status, evidence, owner };
}

function githubEvidence(telemetry: AssetTelemetry, field: "branchProtected" | "readmePresent" | "codeownersPresent" | "secretScanningEnabled") {
  if (telemetry.github.state !== "connected") return undefined;
  return telemetry.github[field];
}

function booleanCheck(input: {
  key: string;
  label: string;
  value: boolean | undefined;
  passed: string;
  failed: string;
  unavailable: string;
  owner: HygieneCheck["owner"];
}) {
  return check(
    input.key,
    input.label,
    input.value === true ? "passed" : input.value === false ? "failed" : "unavailable",
    input.value === true ? input.passed : input.value === false ? input.failed : input.unavailable,
    input.owner,
  );
}

async function responseFor(url: string, redirect: RequestRedirect = "follow") {
  return fetch(url, {
    cache: "no-store",
    redirect,
    headers: { "User-Agent": "Cove-Hygiene-Scanner/1.0" },
    signal: AbortSignal.timeout(7_000),
  });
}

async function productionCheck(asset: ManagedAsset): Promise<HygieneCheck> {
  try {
    const response = await responseFor(asset.productionUrl, "manual");
    const healthy = response.status >= 200 && response.status < 400;
    return check(
      "production",
      "Production URL",
      healthy ? "passed" : "failed",
      healthy
        ? `Vercel responded with HTTP ${response.status}.`
        : `Vercel responded with HTTP ${response.status}; the application team must restore the deployment.`,
      asset.assetKind === "website" ? "Website team" : "Application team",
    );
  } catch {
    return check("production", "Production URL", "failed", "Cove could not reach the registered production URL.", asset.assetKind === "website" ? "Website team" : "Application team");
  }
}

async function ssoCheck(asset: ManagedAsset): Promise<HygieneCheck> {
  try {
    const endpoint = new URL("/.well-known/cove-access", asset.productionUrl);
    const response = await responseFor(endpoint.toString(), "error");
    if (!response.ok) throw new Error("handshake missing");
    const payload = await response.json() as {
      schema?: unknown;
      kitVersion?: unknown;
      provider?: unknown;
      enforced?: unknown;
      status?: unknown;
      application?: { applicationId?: unknown; applicationSlug?: unknown };
      checks?: unknown;
    };
    const applicationMatches = payload.application?.applicationId === asset.applicationId
      || payload.application?.applicationSlug === asset.slug;
    const checksPass = Array.isArray(payload.checks)
      && payload.checks.length > 0
      && payload.checks.every((item) => item && typeof item === "object" && (item as { status?: unknown }).status === "pass");
    const valid = payload.schema === "leatherback.cove-auth.health/v1"
      && typeof payload.kitVersion === "string"
      && /^\d+\.\d+\.\d+/.test(payload.kitVersion)
      && payload.provider === "cove"
      && payload.enforced === true
      && payload.status === "ready"
      && applicationMatches
      && checksPass;
    return check(
      "sso",
      "Cove SSO handshake",
      valid ? "passed" : "failed",
      valid
        ? `Production reports Cove kit v${payload.kitVersion} with passing configuration and server-enforcement evidence.`
        : "The Cove endpoint is reachable, but its application, kit, configuration, or enforcement evidence is invalid.",
      "Application team",
    );
  } catch {
    return check(
      "sso",
      "Cove SSO handshake",
      "failed",
      "Add /.well-known/cove-access and enforce Cove identity inside the application.",
      "Application team",
    );
  }
}

function htmlHas(html: string, pattern: RegExp) {
  return pattern.test(html);
}

async function websiteChecks(asset: ManagedAsset): Promise<readonly HygieneCheck[]> {
  try {
    const response = await responseFor(asset.productionUrl);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return [
        check("website-metadata", "Search metadata", "failed", "The production URL did not return a usable HTML page.", "Website team"),
        check("website-foundations", "Accessible page foundations", "failed", "Cove could not inspect the production HTML.", "Website team"),
        check("website-discovery", "Search discovery files", "failed", "Cove could not verify robots.txt and sitemap.xml.", "Website team"),
      ];
    }
    const html = (await response.text()).slice(0, 750_000);
    const metadataReady = htmlHas(html, /<title[^>]*>\s*[^<]{2,}\s*<\/title>/i)
      && htmlHas(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}["']/i)
      && htmlHas(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\//i);
    const foundationsReady = htmlHas(html, /<html[^>]+lang=["'][a-z]{2}(?:-[A-Z]{2})?["']/i)
      && htmlHas(html, /<meta[^>]+name=["']viewport["']/i)
      && htmlHas(html, /<main(?:\s|>)/i);
    const base = new URL(asset.productionUrl);
    const [robots, sitemap] = await Promise.all([
      responseFor(new URL("/robots.txt", base).toString()).catch(() => null),
      responseFor(new URL("/sitemap.xml", base).toString()).catch(() => null),
    ]);
    const discoveryReady = Boolean(robots?.ok && sitemap?.ok);

    return [
      check("website-metadata", "Search metadata", metadataReady ? "passed" : "failed", metadataReady ? "Title, description and canonical URL are present." : "Add a page title, meta description and canonical URL.", "Website team"),
      check("website-foundations", "Accessible page foundations", foundationsReady ? "passed" : "failed", foundationsReady ? "Language, viewport and main-content landmarks are present." : "Add document language, viewport metadata and a main-content landmark.", "Website team"),
      check("website-discovery", "Search discovery files", discoveryReady ? "passed" : "failed", discoveryReady ? "robots.txt and sitemap.xml are reachable." : "Publish reachable robots.txt and sitemap.xml files.", "Website team"),
    ];
  } catch {
    return [
      check("website-metadata", "Search metadata", "failed", "Cove could not inspect the website HTML.", "Website team"),
      check("website-foundations", "Accessible page foundations", "failed", "Cove could not inspect the website HTML.", "Website team"),
      check("website-discovery", "Search discovery files", "failed", "Cove could not verify robots.txt and sitemap.xml.", "Website team"),
    ];
  }
}

async function scanAsset(asset: ManagedAsset, telemetry: AssetTelemetry): Promise<AssetHygiene> {
  const teamOwner = asset.assetKind === "website" ? "Website team" as const : "Application team" as const;
  const checks: HygieneCheck[] = [
    booleanCheck({
      key: "ownership",
      label: "Named Cove owner",
      value: Boolean(asset.productOwnerUserId),
      passed: `${asset.productOwnerName} is linked as the accountable product owner.`,
      failed: "Link this asset to an active Cove product owner.",
      unavailable: "Ownership could not be evaluated.",
      owner: "Product owner",
    }),
    booleanCheck({
      key: "private-source",
      label: "Private GitHub source",
      value: telemetry.github.state === "connected" ? telemetry.github.visibility === "private" : undefined,
      passed: "GitHub confirms that the repository is private.",
      failed: "The repository is public; change it to private immediately.",
      unavailable: telemetry.github.message,
      owner: teamOwner,
    }),
    booleanCheck({
      key: "branch-protection",
      label: "Protected default branch",
      value: githubEvidence(telemetry, "branchProtected"),
      passed: "GitHub confirms branch protection on the default branch.",
      failed: "Protect the default branch and require reviewed changes.",
      unavailable: "Cove cannot read branch-protection evidence yet.",
      owner: teamOwner,
    }),
  ];

  const runs = telemetry.github.checks;
  checks.push(check(
    "ci",
    "Passing continuous integration",
    telemetry.github.state !== "connected" || !runs || runs.state === "unavailable"
      ? "unavailable"
      : runs.total > 0 && runs.failing === 0 && runs.pending === 0
        ? "passed"
        : "failed",
    telemetry.github.state !== "connected" || !runs || runs.state === "unavailable"
      ? "Cove cannot read the latest GitHub check runs."
      : runs.total === 0
        ? "No CI checks were found on the default branch."
        : runs.failing > 0
          ? `${runs.failing} check ${runs.failing === 1 ? "is" : "are"} failing.`
          : runs.pending > 0
            ? `${runs.pending} check ${runs.pending === 1 ? "is" : "are"} still running.`
            : `${runs.passing} checks are passing.`,
    teamOwner,
  ));

  checks.push(
    booleanCheck({ key: "secret-scanning", label: "Secret scanning", value: githubEvidence(telemetry, "secretScanningEnabled"), passed: "GitHub secret scanning is enabled.", failed: "Enable secret scanning for this repository.", unavailable: "Cove cannot read secret-scanning configuration yet.", owner: teamOwner }),
    booleanCheck({ key: "codeowners", label: "Code ownership", value: githubEvidence(telemetry, "codeownersPresent"), passed: "A CODEOWNERS file assigns review responsibility.", failed: "Add a CODEOWNERS file for the responsible team.", unavailable: "Cove cannot inspect CODEOWNERS yet.", owner: teamOwner }),
    booleanCheck({ key: "runbook", label: "README and runbook", value: githubEvidence(telemetry, "readmePresent"), passed: "The repository contains a README.", failed: "Add a README with setup, deployment and recovery guidance.", unavailable: "Cove cannot inspect the repository README yet.", owner: teamOwner }),
    await productionCheck(asset),
  );

  if (asset.assetKind === "application") checks.push(await ssoCheck(asset));
  else checks.push(...await websiteChecks(asset));

  return {
    assetId: asset.id,
    state: checks.some((item) => item.status === "failed")
      ? "needs_work"
      : checks.some((item) => item.status === "unavailable")
        ? "incomplete_evidence"
        : "ready",
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export async function getAssetHygiene(
  assets: readonly ManagedAsset[],
  telemetry: readonly AssetTelemetry[],
): Promise<readonly AssetHygiene[]> {
  if (identityMode() === "preview") {
    return assets.filter((asset) => asset.repository).map((asset) => ({
      assetId: asset.id,
      state: "incomplete_evidence" as const,
      checkedAt: new Date().toISOString(),
      checks: [check(
        "preview-isolation",
        "Live hygiene scan",
        "unavailable",
        "Live GitHub and Vercel checks stay dormant in demonstration mode.",
        asset.assetKind === "website" ? "Website team" : "Application team",
      )],
    }));
  }

  const telemetryById = new Map(telemetry.map((item) => [item.assetId, item]));
  return Promise.all(assets.filter((asset) => asset.repository).map((asset) => scanAsset(
    asset,
    telemetryById.get(asset.id) ?? {
      assetId: asset.id,
      github: { state: "unavailable", message: "GitHub evidence was not loaded." },
      deployments: { state: "unavailable", message: "Deployment evidence was not loaded." },
    },
  )));
}
