import { buildCoveAuthTemplate } from "../../../packages/cove-auth/src/template.js";
import type { GitHubNextApplicationSource } from "./sso-providers";

export const COVE_AUTH_KIT_VERSION = "1.0.0";

export type CoveAuthChangeSet = {
  readonly files: Readonly<Record<string, string>>;
  readonly manualAction?: string;
};

function patchPackageJson(source: string) {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(source) as Record<string, unknown>;
  } catch {
    throw new Error("The repository package.json is not valid JSON.");
  }
  const dependencies = value.dependencies && typeof value.dependencies === "object" && !Array.isArray(value.dependencies)
    ? value.dependencies as Record<string, unknown>
    : {};
  const scripts = value.scripts && typeof value.scripts === "object" && !Array.isArray(value.scripts)
    ? value.scripts as Record<string, unknown>
    : {};
  const existingTest = typeof scripts.test === "string" && scripts.test.trim() ? scripts.test.trim() : undefined;
  value.dependencies = {
    ...dependencies,
    "@leatherback/cove-auth": "file:packages/cove-auth",
  };
  value.scripts = {
    ...scripts,
    "test:cove-auth": "node --test packages/cove-auth/test/*.test.mjs",
    test: existingTest?.includes("test:cove-auth") ? existingTest : existingTest ? `${existingTest} && npm run test:cove-auth` : "npm run test:cove-auth",
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

function patchPackageLock(source: string, vendoredPackageJson: string) {
  let lock: Record<string, unknown>;
  let vendored: Record<string, unknown>;
  try {
    lock = JSON.parse(source) as Record<string, unknown>;
    vendored = JSON.parse(vendoredPackageJson) as Record<string, unknown>;
  } catch {
    throw new Error("The repository package-lock.json is not valid JSON.");
  }
  const packages = lock.packages && typeof lock.packages === "object" && !Array.isArray(lock.packages)
    ? lock.packages as Record<string, Record<string, unknown>>
    : undefined;
  if (!packages || !packages[""]) {
    throw new Error("The repository package-lock.json does not use a supported npm lockfile format.");
  }
  const root = packages[""];
  const rootDependencies = root.dependencies && typeof root.dependencies === "object" && !Array.isArray(root.dependencies)
    ? root.dependencies as Record<string, unknown>
    : {};
  root.dependencies = { ...rootDependencies, "@leatherback/cove-auth": "file:packages/cove-auth" };
  packages["node_modules/@leatherback/cove-auth"] = { resolved: "packages/cove-auth", link: true };
  packages["packages/cove-auth"] = {
    version: vendored.version,
    license: vendored.license,
    engines: vendored.engines,
    peerDependencies: vendored.peerDependencies,
  };
  return `${JSON.stringify(lock, null, 2)}\n`;
}

function patchLayout(source: string, providerImport: string) {
  if (source.includes("<CoveAuthProvider>") && source.includes("CoveAuthProvider")) return source;
  if (!source.includes("{children}")) {
    throw new Error("Cove could not find the application content in app/layout.tsx without risking existing layout code.");
  }
  const withImport = source.includes(providerImport)
    ? source
    : `${providerImport}\n${source}`;
  return withImport.replace("{children}", "<CoveAuthProvider>{children}</CoveAuthProvider>");
}

export function buildCoveAuthChangeSet(input: {
  readonly applicationId: string;
  readonly applicationSlug: string;
  readonly source: GitHubNextApplicationSource;
}): CoveAuthChangeSet {
  const template = buildCoveAuthTemplate({
    sourceRoot: input.source.sourceRoot,
    applicationId: input.applicationId,
    requestFileName: input.source.proxyPath.endsWith("middleware.ts") ? "middleware.ts" : "proxy.ts",
  });
  const files: Record<string, string> = {
    "package.json": patchPackageJson(input.source.packageJson),
    [input.source.layoutPath]: patchLayout(input.source.layout, template.patches[0].import!),
    ".cove-auth.json": `${JSON.stringify({
      schema: template.schema,
      kit: "@leatherback/cove-auth",
      version: template.kitVersion,
      applicationId: input.applicationId,
      applicationSlug: input.applicationSlug,
      canonicalPrimary: "https://cove.leatherbacktravel.com",
    }, null, 2)}\n`,
  };

  if (input.source.packageLockJson) {
    const vendoredPackageJson = template.files.find((file) => file.path === "packages/cove-auth/package.json")?.content;
    if (!vendoredPackageJson) throw new Error("The Cove authentication package metadata is missing from the generated template.");
    files["package-lock.json"] = patchPackageLock(input.source.packageLockJson, vendoredPackageJson);
  }

  for (const file of template.files) {
    if (file.mode === "example") continue;
    if (file.path === input.source.proxyPath && input.source.proxy) continue;
    files[file.path] = file.content;
  }

  let manualAction: string | undefined;
  if (input.source.proxy) {
    if (input.source.proxy.includes("createCoveProxy")) {
      files[input.source.proxyPath] = input.source.proxy;
    } else {
      manualAction = "This repository already has request middleware. Matthew must review how its existing behaviour is composed with createCoveProxy before the pull request can pass authentication hygiene.";
      files["COVE_AUTH_PROXY_REVIEW.md"] = [
        "# Cove authentication proxy review required",
        "",
        manualAction,
        "",
        "The final proxy must preserve existing non-authentication behaviour, use Clerk's satellite mode with `satelliteAutoSync: true`, and keep every entitlement check beside its page, API, route handler, or server action.",
        "",
      ].join("\n");
    }
  }

  return { files, manualAction };
}
