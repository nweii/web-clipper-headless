// ABOUTME: Round 2 — defuddle returns empty against linkedom. Try debug mode and option variations.
// ABOUTME: Goal: surface the failure mode (silent error vs. low-score filter vs. shape mismatch).

import { parseHTML } from "linkedom";
import { installPolyfills } from "../src/polyfills.ts";

installPolyfills();

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Pragmatic Note Taker</title><meta name="author" content="Sam"></head>
<body>
  <article>
    <h1>Pragmatic Note Taker</h1>
    <p>Note-taking systems fail when their owners optimize for the system instead of the work. The point of a note is to be re-encountered at the right moment.</p>
    <p>The simplest durable system is also the oldest: dated notes, plain text, links between things you actually re-encountered. Search beats hierarchy for retrieval.</p>
    <p>What kills note-taking systems is not lack of features. It is the ongoing tax of maintenance: pruning, re-organizing, migrating between tools, fixing broken links.</p>
    <p>Practical heuristics: avoid one-off categories; prefer atomic notes; link liberally but only when re-encountered; date everything; don't migrate.</p>
  </article>
</body>
</html>`;

async function step(name: string, fn: () => Promise<unknown>) {
  console.error(`\n=== ${name} ===`);
  try {
    const result = await fn();
    if (result !== undefined) console.error(result);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  }
}

const DefuddleMod = await import("defuddle");
const Ctor = (DefuddleMod as { default: unknown }).default as new (
  doc: unknown,
  opts?: Record<string, unknown>
) => { parse: () => unknown };

await step("Try with debug: true on fixture", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document.documentElement as unknown, {
    url: "https://example.com/x",
    debug: true,
  }).parse() as Record<string, unknown>;
  return {
    title: result.title,
    wordCount: result.wordCount,
    debug: result.debug,
  };
});

await step("Pass `document` instead of `documentElement`", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document as unknown, { url: "https://example.com/x" }).parse() as Record<string, unknown>;
  return { title: result.title, wordCount: result.wordCount };
});

await step("removeLowScoring: false", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document.documentElement as unknown, {
    url: "https://example.com/x",
    removeLowScoring: false,
  }).parse() as Record<string, unknown>;
  return { title: result.title, wordCount: result.wordCount, content_len: (result.content as string)?.length };
});

await step("All filters off (max permissive)", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document.documentElement as unknown, {
    url: "https://example.com/x",
    removeExactSelectors: false,
    removePartialSelectors: false,
    removeHiddenElements: false,
    removeLowScoring: false,
    removeSmallImages: false,
    standardize: false,
  }).parse() as Record<string, unknown>;
  return { title: result.title, wordCount: result.wordCount, content_len: (result.content as string)?.length };
});

await step("contentSelector: 'article' (force selection)", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document.documentElement as unknown, {
    url: "https://example.com/x",
    contentSelector: "article",
  }).parse() as Record<string, unknown>;
  return {
    title: result.title,
    wordCount: result.wordCount,
    content_len: (result.content as string)?.length,
    content_preview: (result.content as string)?.slice(0, 200),
  };
});

await step("With markdown: true", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document.documentElement as unknown, {
    url: "https://example.com/x",
    markdown: true,
  }).parse() as Record<string, unknown>;
  return {
    title: result.title,
    wordCount: result.wordCount,
    content_len: (result.content as string)?.length,
    content_preview: (result.content as string)?.slice(0, 200),
  };
});

await step("Defuddle version + module surface", async () => {
  const pkgPath = await import.meta.resolve!("defuddle/package.json");
  const pkg = await import(pkgPath, { with: { type: "json" } });
  return {
    version: (pkg.default as { version: string }).version,
    main: (pkg.default as { main?: string }).main,
    module: (pkg.default as { module?: string }).module,
    exports: Object.keys((pkg.default as { exports?: object }).exports ?? {}),
    defuddle_module_keys: Object.keys(DefuddleMod),
  };
});

console.error("\n=== done ===");
