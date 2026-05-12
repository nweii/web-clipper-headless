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

const LINKEDOM_NEEDLE = "const documentElement = doc.documentElement || doc;";
const LINKEDOM_REPLACEMENT = "const documentElement = doc; /* patched by web-clipper-headless: route Defuddle the Document for linkedom compatibility */";
const LINKEDOM_MARKER = "patched by web-clipper-headless: route Defuddle";

const APPLY_FILTERS_NEEDLE = "function applyFilters(value, filterString, currentUrl) {";
const APPLY_FILTERS_EXPORT = "\n\n// Added by web-clipper-headless to expose the filter chain runner.\nexport { applyFilters };\n";
const APPLY_FILTERS_MARKER = "Added by web-clipper-headless to expose the filter chain runner.";

const OVERRIDES_NEEDLE = "const asyncResolver = createAsyncResolver(doc);";
const OVERRIDES_REPLACEMENT =
  "if (options.variableOverrides) { for (const [k, v] of Object.entries(options.variableOverrides)) { variables[`{{${k}}}`] = v; variables[k] = v; } } /* patched by web-clipper-headless: variable overrides */\n  const asyncResolver = createAsyncResolver(doc);";
const OVERRIDES_MARKER = "patched by web-clipper-headless: variable overrides";

function applyPatches(): void {
  let source = readFileSync(apiBundle, "utf-8");
  let changed = false;
  const applied: string[] = [];
  const skipped: string[] = [];

  if (source.includes(LINKEDOM_MARKER)) {
    skipped.push("linkedom-document");
  } else {
    if (!source.includes(LINKEDOM_NEEDLE)) {
      console.error(
        "[web-clipper-headless] WARNING: documentElement line not found in upstream bundle. " +
          "Upstream may have changed. Open scripts/build-upstream.ts and update LINKEDOM_NEEDLE."
      );
      process.exit(1);
    }
    source = source.replace(LINKEDOM_NEEDLE, LINKEDOM_REPLACEMENT);
    applied.push("linkedom-document");
    changed = true;
  }

  if (source.includes(OVERRIDES_MARKER)) {
    skipped.push("variable-overrides");
  } else {
    if (!source.includes(OVERRIDES_NEEDLE)) {
      console.error(
        "[web-clipper-headless] WARNING: asyncResolver anchor not found in upstream bundle. " +
          "Open scripts/build-upstream.ts and update OVERRIDES_NEEDLE."
      );
      process.exit(1);
    }
    source = source.replace(OVERRIDES_NEEDLE, OVERRIDES_REPLACEMENT);
    applied.push("variable-overrides");
    changed = true;
  }

  if (source.includes(APPLY_FILTERS_MARKER)) {
    skipped.push("applyFilters-export");
  } else {
    if (!source.includes(APPLY_FILTERS_NEEDLE)) {
      console.error(
        "[web-clipper-headless] WARNING: applyFilters function not found in upstream bundle. " +
          "Open scripts/build-upstream.ts and update APPLY_FILTERS_NEEDLE."
      );
      process.exit(1);
    }
    source = source + APPLY_FILTERS_EXPORT;
    applied.push("applyFilters-export");
    changed = true;
  }

  if (changed) writeFileSync(apiBundle, source);
  console.error(
    `[web-clipper-headless] Patches — applied: [${applied.join(", ") || "none"}]; skipped (already present): [${skipped.join(", ") || "none"}].`
  );
}

if (existsSync(apiBundle)) {
  console.error("[web-clipper-headless] obsidian-clipper API already built; verifying patches.");
  applyPatches();
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

applyPatches();

console.error("[web-clipper-headless] Upstream API ready at " + apiBundle);
