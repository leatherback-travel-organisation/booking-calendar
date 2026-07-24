import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendoredFiles = [
  "src/components.d.ts",
  "src/components.js",
  "src/core.d.ts",
  "src/core.js",
  "src/errors.d.ts",
  "src/errors.js",
  "src/health.d.ts",
  "src/health.js",
  "src/provider.d.ts",
  "src/provider.js",
  "src/proxy.d.ts",
  "src/proxy.js",
  "src/server.d.ts",
  "src/server.js",
  "src/index.js",
  "src/index.d.ts",
  "package.json",
];

const entries = await Promise.all(
  vendoredFiles.map(async (path) => {
    if (path === "src/index.js") {
      return [path, 'export * from "./core.js";\nexport * from "./errors.js";\n'];
    }
    if (path === "src/index.d.ts") {
      return [path, 'export * from "./core.js";\nexport * from "./errors.js";\n'];
    }
    const content = await readFile(join(packageRoot, path), "utf8");
    if (path !== "package.json") return [path, content];
    const manifest = JSON.parse(content);
    delete manifest.exports["./template"];
    delete manifest.exports["./vendored"];
    delete manifest.scripts;
    delete manifest.files;
    return [path, `${JSON.stringify(manifest, null, 2)}\n`];
  }),
);

const source = `const VENDORED_PACKAGE_FILES = Object.freeze(${JSON.stringify(Object.fromEntries(entries), null, 2)});

export function buildVendoredCoveAuthPackageFiles({ targetRoot = "packages/cove-auth" } = {}) {
  const root = normalizeTargetRoot(targetRoot);
  return Object.entries(VENDORED_PACKAGE_FILES).map(([path, content]) => ({
    path: root ? \`\${root}/\${path}\` : path,
    mode: "create",
    content: path === "package.json"
      ? content
          .replace('"next": ">=16.0.11 <17"', '"next": ">=15.5.9 <17"')
          .replace('"react": ">=19.2.4 <20"', '"react": ">=19.1.4 <20"')
          .replace('"react-dom": ">=19.2.4 <20"', '"react-dom": ">=19.1.4 <20"')
      : content,
  }));
}

function normalizeTargetRoot(targetRoot) {
  if (typeof targetRoot !== "string") throw new TypeError("targetRoot must be a relative repository path.");
  const normalized = targetRoot.trim().replace(/^\\.\\//, "").replace(/\\/$/, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new TypeError("targetRoot must remain inside the target repository.");
  }
  return normalized;
}
`;

await writeFile(join(packageRoot, "src/vendored.js"), source);
