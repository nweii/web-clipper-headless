#!/usr/bin/env bun
// ABOUTME: CLI entry point. Takes a URL + template name + settings JSON path; emits the
// rendered note to stdout (or a file with --output). Optionally runs the LLM interpreter
// server-side (--interpret) using the credential resolution chain.

import { writeFileSync } from "node:fs";
import { renderFromSettings, installPolyfills } from "../src/index.ts";

type Args = {
  url: string;
  template?: string;
  settings: string;
  interpret: boolean;
  output?: string;
  credentialSource?: "env" | "json" | "auto";
  slotOverrides: Record<string, string>;
};

function printUsage() {
  console.error(
    `
web-clipper-headless — render a Web Clipper template from a URL

Usage:
  wch <url> [--template <name>] [--settings <path>] [options]

If --template is omitted, the template is auto-matched by URL/schema triggers.
Explicit --template always wins over auto-match.

Options:
  -t, --template <name>          Template name (optional — auto-match by triggers if absent)
  -s, --settings <path>          Path to settings JSON or folder of templates
                                 (defaults to WEB_CLIPPER_SETTINGS_PATH env var)
  -o, --output <file>            Write to file (default: stdout)
      --interpret                Run the LLM interpreter server-side (otherwise interpreter slots stay empty)
      --credentials <source>     'env' | 'json' | 'auto' (default: auto)
      --slot <key=value>         Pre-fill an interpreter slot (repeatable). Skips LLM call for that slot.
  -h, --help                     Show this help

Env vars: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY,
          OPENROUTER_API_KEY, etc. — see provider-mapping.ts for the full table.

Examples:
  wch https://example.com/article -t "Full text" -s ~/path/to/clipper-settings.json
  wch https://example.com/article -t Summary -s ~/clipper.json --interpret
  wch https://example.com/article -t "Full text" -s ~/clipper.json \\
      --slot slot_0="my pre-filled tag list"
`.trim()
  );
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let url = "";
  let template: string | undefined;
  let settings = "";
  let interpret = false;
  let output: string | undefined;
  let credentialSource: Args["credentialSource"] = "auto";
  const slotOverrides: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    switch (a) {
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      case "-t":
      case "--template":
        template = expectValue(args, ++i, a);
        break;
      case "-s":
      case "--settings":
        settings = expectValue(args, ++i, a);
        break;
      case "-o":
      case "--output":
        output = expectValue(args, ++i, a);
        break;
      case "--interpret":
        interpret = true;
        break;
      case "--credentials": {
        const v = expectValue(args, ++i, a);
        if (v !== "env" && v !== "json" && v !== "auto") {
          fail(`--credentials expects 'env' | 'json' | 'auto', got '${v}'`);
        }
        credentialSource = v;
        break;
      }
      case "--slot": {
        const v = expectValue(args, ++i, a);
        const eq = v.indexOf("=");
        if (eq <= 0) fail(`--slot expects key=value, got '${v}'`);
        slotOverrides[v.slice(0, eq)] = v.slice(eq + 1);
        break;
      }
      default:
        if (!a.startsWith("-") && !url) {
          url = a;
        } else {
          fail(`Unknown argument: ${a}`);
        }
    }
  }

  if (!settings && process.env.WEB_CLIPPER_SETTINGS_PATH) {
    settings = process.env.WEB_CLIPPER_SETTINGS_PATH;
  }

  if (!url) fail("URL is required.");
  if (!settings) {
    fail(
      "--settings is required (or set WEB_CLIPPER_SETTINGS_PATH env var to your clipper settings JSON path)."
    );
  }

  return { url, template, settings, interpret, output, credentialSource, slotOverrides };
}

function expectValue(args: string[], index: number, flag: string): string {
  const v = args[index];
  if (v === undefined) fail(`${flag} expects a value.`);
  return v as string;
}

function fail(message: string): never {
  console.error(`Error: ${message}\n`);
  printUsage();
  process.exit(1);
}

async function main(): Promise<void> {
  installPolyfills();
  const args = parseArgs(process.argv);

  const result = await renderFromSettings({
    url: args.url,
    settingsPath: args.settings,
    templateName: args.template,
    useInterpreter: args.interpret,
    credentialSource: args.credentialSource,
    slotOverrides: args.slotOverrides,
  });

  if (result.status === "needs_interpretation") {
    console.error(
      `\nTemplate '${result.template.name}' has ${result.unresolvedSlots.length} interpreter slot(s) and no provider was configured.`
    );
    console.error("Either pass --interpret to dispatch server-side, or pre-fill via --slot key=value.");
    console.error("\nUnresolved slots:");
    for (const slot of result.unresolvedSlots) {
      console.error(`  ${slot.key}  (location: ${describeLocation(slot.location)})`);
      console.error(`    prompt: ${slot.prompt.slice(0, 120)}${slot.prompt.length > 120 ? "…" : ""}`);
      if (slot.filterChain) console.error(`    filters: ${slot.filterChain}`);
    }
    if (result.pageContent.suspiciousPhrasesDetected?.length) {
      console.error(
        `\nSuspicious phrases detected in page content: ${result.pageContent.suspiciousPhrasesDetected.join(", ")}`
      );
    }
    process.exit(2);
  }

  if (args.output) {
    writeFileSync(args.output, result.fullContent, "utf-8");
    console.error(`Wrote ${result.filename} → ${args.output}`);
  } else {
    process.stdout.write(result.fullContent);
  }
}

function describeLocation(loc: { kind: string; propertyName?: string }): string {
  if (loc.kind === "property") return `property '${loc.propertyName}'`;
  return loc.kind;
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
