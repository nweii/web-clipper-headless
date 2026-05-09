// ABOUTME: Top-level render function. Handles defuddle/clip dispatch via obsidian-clipper/api,
// ABOUTME: identifies interpreter slots, and applies overrides. LLM dispatch lives elsewhere
// ABOUTME: (interpreter.ts) and is called from here when slotOverrides don't cover all slots.

import { parseHTML } from "linkedom";
import { installPolyfills } from "./polyfills.ts";
import { findInterpreterSlots, substituteSlots } from "./tokens.ts";
import type {
  PageContent,
  PreparedState,
  RenderOptions,
  RenderResult,
} from "./types.ts";

export async function render(options: RenderOptions): Promise<RenderResult> {
  installPolyfills();

  const html = options.fetchHtml
    ? await options.fetchHtml(options.url)
    : await defaultFetch(options.url);

  const slots = findInterpreterSlots(options.template);
  const overrides = options.slotOverrides ?? {};
  const unresolvedSlots = slots.filter((s) => !(s.key in overrides));

  if (unresolvedSlots.length > 0 && !options.providerConfig) {
    const pageContent = await buildPageContent(options.url, html);
    const preparedState: PreparedState = {
      schemaVersion: 1,
      url: options.url,
      templateName: options.template.name,
      defuddleResult: null,
      slotMap: slots,
      createdAt: Date.now(),
    };
    return {
      status: "needs_interpretation",
      unresolvedSlots,
      pageContent,
      preparedState,
    };
  }

  if (unresolvedSlots.length > 0 && options.providerConfig) {
    throw new Error(
      "Server-side LLM dispatch not yet implemented. Pass slotOverrides for all slots, or wait for interpreter.ts."
    );
  }

  const resolvedTemplate = substituteSlots(options.template, overrides);

  const { clip } = await import("obsidian-clipper/api");
  const documentParser = {
    parseFromString(h: string) {
      return parseHTML(h).document;
    },
  };
  const result = await clip({
    html,
    url: options.url,
    template: resolvedTemplate as never,
    documentParser,
  });

  return {
    status: "rendered",
    filename: result.noteName,
    frontmatter: result.frontmatter,
    content: result.content,
    fullContent: result.fullContent,
    resolvedSlots: overrides,
  };
}

async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (web-clipper-headless)" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function buildPageContent(url: string, html: string): Promise<PageContent> {
  const { document } = parseHTML(html);
  const title = document.querySelector("title")?.textContent ?? undefined;
  return {
    source: "external_url",
    trusted: false,
    url,
    title,
    body: extractTextBody(document),
  };
}

function extractTextBody(doc: Document): string {
  const article = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  return article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
