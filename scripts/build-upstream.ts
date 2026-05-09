// ABOUTME: Builds obsidian-clipper's headless API bundle (dist/api.mjs) after install,
// then patches a linkedom-incompatible line so Defuddle receives the Document.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function findUpstreamRoot(): string {
  const candidates = [
    join(import.meta.dir, "..", "node_modules", "obsidian-clipper"),
    join(import.meta.dir, "..", "..", "obsidian-clipper"),
  ];
  for (const path of candidates) {
    if (existsSync(join(path, "package.json"))) return path;
  }
  throw new Error(
    "Could not locate obsidian-clipper in node_modules. Try `bun install` first."
  );
}

const upstreamRoot = findUpstreamRoot();
const apiBundle = join(upstreamRoot, "dist", "api.mjs");

const PATCH_NEEDLE = "const documentElement = doc.documentElement || doc;";
const PATCH_REPLACEMENT = "const documentElement = doc; /* patched by web-clipper-headless: route Defuddle the Document for linkedom compatibility */";
const PATCHED_MARKER = "patched by web-clipper-headless";

const APPLY_FILTERS_NEEDLE = "function applyFilters(value, filterString, currentUrl) {";
const APPLY_FILTERS_EXPORT = "\n\n// Added by web-clipper-headless to expose the filter chain runner.\nexport { applyFilters };\n";

function applyLinkedomPatch(): void {
  const source = readFileSync(apiBundle, "utf-8");
  if (source.includes(PATCHED_MARKER)) {
    console.error("[web-clipper-headless] Patches already applied.");
    return;
  }
  if (!source.includes(PATCH_NEEDLE)) {
    console.error(
      "[web-clipper-headless] WARNING: documentElement line not found in upstream bundle. " +
        "Upstream may have changed. Open scripts/build-upstream.ts and update PATCH_NEEDLE."
    );
    process.exit(1);
  }
  if (!source.includes(APPLY_FILTERS_NEEDLE)) {
    console.error(
      "[web-clipper-headless] WARNING: applyFilters function not found in upstream bundle. " +
        "Open scripts/build-upstream.ts and update APPLY_FILTERS_NEEDLE."
    );
    process.exit(1);
  }
  const patched = source.replace(PATCH_NEEDLE, PATCH_REPLACEMENT) + APPLY_FILTERS_EXPORT;
  writeFileSync(apiBundle, patched);
  console.error(
    "[web-clipper-headless] Applied linkedom-compatibility patch and exposed applyFilters."
  );
}

if (existsSync(apiBundle)) {
  console.error("[web-clipper-headless] obsidian-clipper API already built; verifying patch.");
  applyLinkedomPatch();
  process.exit(0);
}

console.error("[web-clipper-headless] Building obsidian-clipper headless API…");

const installResult = spawnSync("bun", ["install", "--silent"], {
  cwd: upstreamRoot,
  stdio: "inherit",
});
if (installResult.status !== 0) {
  console.error("[web-clipper-headless] Failed to install upstream dependencies.");
  process.exit(installResult.status ?? 1);
}

const buildResult = spawnSync("bun", ["run", "build:api"], {
  cwd: upstreamRoot,
  stdio: "inherit",
});
if (buildResult.status !== 0) {
  console.error("[web-clipper-headless] Failed to build upstream API bundle.");
  process.exit(buildResult.status ?? 1);
}

applyLinkedomPatch();

console.error("[web-clipper-headless] Upstream API ready at " + apiBundle);
