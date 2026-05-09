// ABOUTME: Isolated reproduction for the empty-defuddle output we observed in /tmp/clip-test.
// ABOUTME: Walks polyfill setup, defuddle alone, then clip() — narrows the failure layer.

import { parseHTML } from "linkedom";
import { installPolyfills } from "../src/polyfills.ts";

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>The Pragmatic Note Taker</title>
  <meta name="author" content="Sam Example">
  <meta property="og:description" content="A short essay on durable note-taking practices.">
  <meta name="published_time" content="2025-09-15">
  <meta property="og:site_name" content="Example Press">
</head>
<body>
  <header><nav><a href="/">Home</a> · <a href="/about">About</a></nav></header>
  <article>
    <h1>The Pragmatic Note Taker</h1>
    <p class="byline">By Sam Example · September 15, 2025</p>
    <p>Note-taking systems fail when their owners optimize for the system instead of the work. The point of a note is to be re-encountered at the right moment, in the right context, with enough surrounding signal to be useful again. Most people index too aggressively and re-read too rarely.</p>
    <p>The simplest durable system is also the oldest: dated notes, plain text, links between things you actually re-encountered. Search beats hierarchy for retrieval. Hierarchy beats search for navigation. A good system uses both.</p>
    <p>What kills note-taking systems is not lack of features. It is the ongoing tax of maintenance: pruning, re-organizing, migrating between tools, fixing broken links. The lower the tax, the longer the system survives.</p>
    <p>Practical heuristics: avoid one-off categories; prefer atomic notes; link liberally but only when re-encountered; date everything; don't migrate.</p>
    <p>The longest-running personal knowledge systems I've seen are unglamorous. Dated journal files. A few index notes. Aggressive search. And, crucially, a refusal to let the system itself become the project.</p>
  </article>
  <footer><p>© 2025 Example Press</p></footer>
</body>
</html>`;

const REAL_URL = "https://stephango.com/file-over-app";

async function step(name: string, fn: () => Promise<unknown>) {
  console.error(`\n=== ${name} ===`);
  try {
    const result = await fn();
    if (result !== undefined) console.error(result);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : err);
  }
}

await step("globals BEFORE polyfill install", () =>
  Promise.resolve({
    window: typeof globalThis.window,
    DOMParser: typeof (globalThis as { DOMParser?: unknown }).DOMParser,
    document: typeof globalThis.document,
  })
);

installPolyfills();

await step("globals AFTER polyfill install", () =>
  Promise.resolve({
    window: typeof globalThis.window,
    DOMParser: typeof (globalThis as { DOMParser?: unknown }).DOMParser,
    document: typeof globalThis.document,
    DOMParser_canParse: (() => {
      try {
        const G = globalThis as { DOMParser?: new () => { parseFromString: (s: string, m?: string) => unknown } };
        if (!G.DOMParser) return "no DOMParser";
        const inst = new G.DOMParser();
        const out = inst.parseFromString("<p>hi</p>", "text/html");
        return out ? "parses ok" : "returns falsy";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })(),
  })
);

await step("linkedom parseHTML on fixture", async () => {
  const { document } = parseHTML(FIXTURE_HTML);
  return {
    title: document.querySelector("title")?.textContent,
    h1: document.querySelector("h1")?.textContent,
    article_p_count: document.querySelectorAll("article p").length,
    body_text_len: document.body?.textContent?.length,
  };
});

await step("defuddle directly on fixture (no clip)", async () => {
  const DefuddleMod = await import("defuddle");
  const DefuddleClass = (DefuddleMod as { default: unknown }).default ?? DefuddleMod;
  const Ctor = DefuddleClass as new (doc: unknown, opts: { url: string }) => {
    parse: () => {
      title: string;
      author: string;
      content: string;
      wordCount: number;
      description: string;
      site: string;
      published: string;
      schemaOrgData: unknown;
    };
  };
  const { document } = parseHTML(FIXTURE_HTML);
  const result = new Ctor(document.documentElement as unknown, {
    url: "https://example.com/test",
  }).parse();
  return {
    title: result.title,
    author: result.author,
    site: result.site,
    published: result.published,
    description: result.description,
    wordCount: result.wordCount,
    content_len: result.content?.length ?? 0,
    content_preview: result.content?.slice(0, 200),
  };
});

await step("defuddle directly on REAL fetched URL", async () => {
  const html = await (await fetch(REAL_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  })).text();
  const DefuddleMod = await import("defuddle");
  const DefuddleClass = (DefuddleMod as { default: unknown }).default ?? DefuddleMod;
  const Ctor = DefuddleClass as new (doc: unknown, opts: { url: string }) => {
    parse: () => {
      title: string;
      content: string;
      wordCount: number;
    };
  };
  const { document } = parseHTML(html);
  const result = new Ctor(document.documentElement as unknown, { url: REAL_URL }).parse();
  return {
    fetched_html_len: html.length,
    title: result.title,
    wordCount: result.wordCount,
    content_len: result.content?.length ?? 0,
    content_preview: result.content?.slice(0, 200),
  };
});

await step("upstream clip() on fixture (deterministic template)", async () => {
  const { clip } = await import("obsidian-clipper/api");
  const documentParser = {
    parseFromString(h: string) {
      return parseHTML(h).document;
    },
  };
  const template = {
    schemaVersion: "0.1.0",
    name: "Test",
    behavior: "create",
    noteNameFormat: "{{title}}",
    noteContentFormat: "TITLE={{title}}\nAUTHOR={{author}}\nWORDS={{wordCount}}\nCONTENT={{content}}",
    properties: [
      { name: "title", value: "{{title}}", type: "text" },
      { name: "static", value: "literal", type: "text" },
    ],
    triggers: [],
  };
  const result = await clip({
    html: FIXTURE_HTML,
    url: "https://example.com/test",
    template: template as never,
    documentParser,
  });
  return {
    noteName: result.noteName,
    title_var: result.variables?.title,
    author_var: result.variables?.author,
    wordCount_var: result.variables?.wordCount,
    content_var_len:
      typeof result.variables?.content === "string" ? result.variables.content.length : 0,
    content_preview:
      typeof result.variables?.content === "string"
        ? result.variables.content.slice(0, 200)
        : "(not a string)",
    fullContent_preview: result.fullContent?.slice(0, 400),
  };
});

console.error("\n=== done ===");
