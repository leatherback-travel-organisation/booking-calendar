import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const minimumPixelSize = 11;
const maximumFontWeight = 500;
const forbiddenFontFamilies = ["Avenir Next", "Century Gothic"];
const violations = [];

async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(path);
      continue;
    }
    if (extname(entry.name) !== ".css") continue;

    const source = await readFile(path, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi)) {
        const value = Number(match[1]);
        if (value < minimumPixelSize) {
          violations.push(`${relative(process.cwd(), path)}:${index + 1} uses ${value}px text`);
        }
      }
      for (const match of line.matchAll(/font-weight\s*:\s*([0-9]+)/gi)) {
        const value = Number(match[1]);
        if (value > maximumFontWeight) {
          violations.push(`${relative(process.cwd(), path)}:${index + 1} uses font weight ${value}`);
        }
      }
      for (const family of forbiddenFontFamilies) {
        if (line.toLowerCase().includes(family.toLowerCase())) {
          violations.push(`${relative(process.cwd(), path)}:${index + 1} uses forbidden font ${family}`);
        }
      }
    });
  }
}

await inspect(sourceRoot);

if (violations.length) {
  console.error(
    `CSS readability check failed. Production text must be at least ${minimumPixelSize}px and no heavier than ${maximumFontWeight}.`,
  );
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log(
    `CSS readability check passed: text is at least ${minimumPixelSize}px, font weights are ${maximumFontWeight} or lighter, and retired font families are absent.`,
  );
}
