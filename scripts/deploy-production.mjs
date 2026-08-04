import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = {
  orgId: "team_bCUUoKPj3tAnwhOT5OvDgQwM",
  projectId: "prj_4LYY66RXGjeRehe0mfheF5NkR10V",
  projectName: "lbcove",
  scope: "leatherback-travel",
  automaticProductionDomain: "lbcove-leatherback-travel.vercel.app",
  canonicalDomain: "cove.leatherbacktravel.com",
  legacyDomain: "lbcove.vercel.app",
};

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vercelDirectory = resolve(rootDirectory, ".vercel");
const linkPath = resolve(vercelDirectory, "project.json");
const canonicalRepository = "leatherback-travel-organisation/cove-superpanel";

function git(args) {
  return execFileSync("git", args, {
    cwd: rootDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ensurePublishedGitState() {
  if (git(["status", "--porcelain"])) {
    throw new Error("Production deployment requires a clean Git working tree. Commit and push every intended change first.");
  }

  const branch = git(["branch", "--show-current"]);
  if (!branch) {
    throw new Error("Production deployment requires a named Git branch.");
  }

  const remoteUrl = git(["remote", "get-url", "origin"]);
  if (!remoteUrl.includes(canonicalRepository)) {
    throw new Error(`Production deployment requires the canonical ${canonicalRepository} GitHub remote.`);
  }

  const head = git(["rev-parse", "HEAD"]);
  let remoteHead;

  try {
    remoteHead = git(["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`]).split(/\s+/)[0];
  } catch {
    throw new Error(`Push branch ${branch} to the canonical GitHub repository before deploying production.`);
  }

  if (remoteHead !== head) {
    throw new Error(`Production deployment requires local ${branch} to exactly match origin/${branch}. Commit and push first.`);
  }

  console.log(`GitHub source confirmed: ${canonicalRepository}@${head.slice(0, 12)}`);
}

async function ensureCorrectProjectLink() {
  let currentLink;

  try {
    currentLink = JSON.parse(await readFile(linkPath, "utf8"));
  } catch {
    currentLink = null;
  }

  const isCorrect =
    currentLink?.orgId === project.orgId &&
    currentLink?.projectId === project.projectId &&
    currentLink?.projectName === project.projectName;

  if (isCorrect) {
    console.log(`Vercel target confirmed: ${project.scope}/${project.projectName}`);
    return;
  }

  await mkdir(vercelDirectory, { recursive: true });
  await writeFile(
    linkPath,
    `${JSON.stringify({
      orgId: project.orgId,
      projectId: project.projectId,
      projectName: project.projectName,
    })}\n`,
    "utf8",
  );

  console.log(`Vercel target repaired: ${project.scope}/${project.projectName}`);
}

function runVercel(args, action) {
  return new Promise((resolvePromise, reject) => {
    const command = process.platform === "win32" ? "vercel.cmd" : "vercel";
    const processHandle = spawn(command, args, {
      cwd: rootDirectory,
      env: {
        ...process.env,
        VERCEL_ORG_ID: project.orgId,
        VERCEL_PROJECT_ID: project.projectId,
      },
      stdio: "inherit",
    });

    processHandle.on("error", reject);
    processHandle.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(
          signal
            ? `Vercel ${action} stopped by signal ${signal}.`
            : `Vercel ${action} failed with exit code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

ensurePublishedGitState();
await ensureCorrectProjectLink();
await runVercel(
  ["deploy", "--prod", "--yes", "--scope", project.scope],
  "production deployment",
);
await runVercel(
  [
    "alias",
    "set",
    project.automaticProductionDomain,
    project.canonicalDomain,
    "--scope",
    project.scope,
  ],
  "canonical alias update",
);
await runVercel(
  [
    "alias",
    "set",
    project.automaticProductionDomain,
    project.legacyDomain,
    "--scope",
    project.scope,
  ],
  "legacy alias update",
);

console.log(`Canonical production URL updated: https://${project.canonicalDomain}/`);
