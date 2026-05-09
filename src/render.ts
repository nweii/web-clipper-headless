// ABOUTME: Top-level render function. Handles defuddle/clip dispatch via obsidian-clipper/api,
// identifies interpreter slots, dispatches LLM calls when a providerConfig is supplied,
// and applies overrides. Returns either a rendered note or a needs_interpretation
// shape that callers (e.g. the chat-flow MCP path) can resolve themselves.

import { parseHTML } from "linkedom";
import { installPolyfills } from "./polyfills.ts";
import { findInterpreterSlots, substituteSlots } from "./tokens.ts";
import { interpretSlot } from "./interpreter.ts";
import { scanForInjection } from "./scan.ts";
import type {
  ClipperTemplate,
  InterpreterSlot,
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

  let resolvedSlots: Record<string, string> = { ...overrides };

  if (unresolvedSlots.length > 0 && options.providerConfig) {
    resolvedSlots = await dispatchInterpreter({
      url: options.url,
      html,
      template: options.template,
      slots: unresolvedSlots,
      overrides,
      providerConfig: options.providerConfig,
    });
  }

  const resolvedTemplate = substituteSlots(options.template, resolvedSlots);

  const { clip } = await import("obsidian-clipper/api");
  const result = await clip({
    html,
    url: options.url,
    template: resolvedTemplate as never,
    documentParser: makeDocumentParser(),
  });

  return {
    status: "rendered",
    filename: result.noteName,
    frontmatter: result.frontmatter,
    content: result.content,
    fullContent: result.fullContent,
    resolvedSlots,
  };
}

async function dispatchInterpreter(args: {
  url: string;
  html: string;
  template: ClipperTemplate;
  slots: InterpreterSlot[];
  overrides: Record<string, string>;
  providerConfig: NonNullable<RenderOptions["providerConfig"]>;
}): Promise<Record<string, string>> {
  const { applyFilters } = await import("obsidian-clipper/api");

  const pageContext = await buildPageContext(args.url, args.html);
  const propertyTypes = new Map<string, "text" | "multitext">();
  for (const prop of args.template.properties) {
    if (prop.type === "text" || prop.type === "multitext") {
      propertyTypes.set(prop.name, prop.type);
    }
  }

  const resolved: Record<string, string> = { ...args.overrides };
  for (const slot of args.slots) {
    const propertyType =
      slot.location.kind === "property" ? propertyTypes.get(slot.location.propertyName) : undefined;
    const value = await interpretSlot({
      slot,
      pageContext,
      providerConfig: args.providerConfig,
      applyFilters,
      currentUrl: args.url,
      propertyType,
    });
    resolved[slot.key] = value;
  }
  return resolved;
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
  const ctx = await buildPageContext(url, html);
  const scan = scanForInjection(ctx.body);
  return {
    source: "external_url",
    trusted: false,
    url,
    title: ctx.title,
    body: ctx.body,
    suspiciousPhrasesDetected: scan.matches.map((m) => m.pattern),
  };
}

async function buildPageContext(
  url: string,
  html: string
): Promise<{ url: string; title: string | undefined; body: string }> {
  const { document } = parseHTML(html);
  const title = document.querySelector("title")?.textContent ?? undefined;
  return {
    url,
    title,
    body: extractTextBody(document),
  };
}

function extractTextBody(doc: Document): string {
  const article = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  return article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

// Returns the linkedom Document directly. Upstream's clip() bundle is patched at build
// time by scripts/build-upstream.ts so Defuddle receives the Document instead of its
// documentElement (the patch route is required for linkedom compatibility).
function makeDocumentParser() {
  return {
    parseFromString(h: string) {
      return parseHTML(h).document;
    },
  };
}
