// ABOUTME: Verify the "pass document directly to Defuddle" path produces a full result.

import { parseHTML } from "linkedom";
import { installPolyfills } from "../src/polyfills.ts";

installPolyfills();

const HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Pragmatic Note Taker</title><meta name="author" content="Sam"></head>
<body>
  <article>
    <h1>Pragmatic Note Taker</h1>
    <p>Note-taking systems fail when their owners optimize for the system instead of the work. The point of a note is to be re-encountered at the right moment.</p>
    <p>The simplest durable system is also the oldest: dated notes, plain text, links between things you actually re-encountered.</p>
    <p>What kills note-taking systems is not lack of features. It is the ongoing tax of maintenance.</p>
    <p>Practical heuristics: avoid one-off categories; prefer atomic notes; link liberally but only when re-encountered.</p>
  </article>
</body>
</html>`;

const DefuddleMod = await import("defuddle");
const Ctor = (DefuddleMod as { default: unknown }).default as new (
  doc: unknown,
  opts?: Record<string, unknown>
) => { parse: () => unknown };

const { document } = parseHTML(HTML);

console.error("Document.getAttribute exists?", typeof (document as { getAttribute?: unknown }).getAttribute);
console.error("Document.documentElement.getAttribute exists?", typeof (document.documentElement as { getAttribute?: unknown }).getAttribute);

const result = new Ctor(document as unknown, { url: "https://example.com/x", debug: true }).parse() as Record<string, unknown>;

console.error("\n=== Defuddle result ===");
for (const key of ["title", "author", "site", "language", "published", "description", "wordCount"]) {
  console.error(`${key}:`, result[key]);
}
console.error("content_len:", (result.content as string)?.length);
console.error("content_preview:", (result.content as string)?.slice(0, 200));
