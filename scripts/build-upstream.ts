// ABOUTME: Builds obsidian-clipper's headless API bundle (dist/api.mjs) after install.
// ABOUTME: Required because upstream is installed from GitHub without a published dist.

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
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

if (existsSync(apiBundle)) {
  console.error("[web-clipper-headless] obsidian-clipper API already built; skipping.");
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

console.error("[web-clipper-headless] Upstream API ready at " + apiBundle);
