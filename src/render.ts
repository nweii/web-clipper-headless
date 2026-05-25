// ABOUTME: Top-level render function. Handles defuddle/clip dispatch via obsidian-clipper/api,
// identifies interpreter slots, dispatches LLM calls when a providerConfig is supplied,
// and applies overrides. Returns either a rendered note or a needs_interpretation
// shape that callers (e.g. the chat-flow MCP path) can resolve themselves.

import { parseHTML } from "linkedom";
import { installPolyfills } from "./polyfills.ts";
import { findInterpreterSlots, substituteSlots } from "./tokens.ts";
import { interpretSlots } from "./interpreter.ts";
import { scanForInjection } from "./scan.ts";
import { assertHeadlessCompatible } from "./headless-check.ts";
import { sanitizeNoteName } from "./sanitize.ts";
import { detectSentinel, SourceNeedsOverridesError } from "./sources.ts";
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
  assertHeadlessCompatible(options.template);

  const html = options.fetchHtml
    ? await options.fetchHtml(options.url)
    : await defaultFetch(options.url);

  const variableOverrides = options.variableOverrides ?? {};
  assertSourceUsable(options.url, html, variableOverrides);

  const slots = findInterpreterSlots(options.template);
  const overrides = options.slotOverrides ?? {};
  const unresolvedSlots = slots.filter((s) => !(s.key in overrides));

  if (unresolvedSlots.length > 0 && !options.providerConfig) {
    const pageContent = await buildPageContent(options.url, html, variableOverrides);
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

  const { clip, applyFilters } = await import("obsidian-clipper/api");

  let resolvedSlots: Record<string, string> = applyOverrideFilters(
    overrides,
    slots,
    options.url,
    applyFilters
  );

  if (unresolvedSlots.length > 0 && options.providerConfig) {
    resolvedSlots = await dispatchInterpreter({
      url: options.url,
      html,
      template: options.template,
      slots: unresolvedSlots,
      overrides,
      providerConfig: options.providerConfig,
      variableOverrides,
      applyFilters,
    });
  }

  const resolvedTemplate = substituteSlots(options.template, resolvedSlots);
  const result = await clip({
    html,
    url: options.url,
    template: resolvedTemplate as never,
    documentParser: makeDocumentParser(),
    variableOverrides: Object.keys(variableOverrides).length ? variableOverrides : undefined,
  });

  return {
    status: "rendered",
    filename: sanitizeNoteName(result.noteName),
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
  variableOverrides: Record<string, string>;
  applyFilters: ApplyFiltersFn;
}): Promise<Record<string, string>> {
  const pageContext = await buildPageContext(args.url, args.html, args.variableOverrides);
  const propertyTypes = new Map<string, "text" | "multitext">();
  for (const prop of args.template.properties) {
    if (prop.type === "text" || prop.type === "multitext") {
      propertyTypes.set(prop.name, prop.type);
    }
  }

  const interpreted = await interpretSlots({
    slots: args.slots,
    pageContext,
    providerConfig: args.providerConfig,
    applyFilters: args.applyFilters,
    currentUrl: args.url,
    propertyTypes,
  });

  const allSlots = findInterpreterSlots(args.template);
  const filteredOverrides = applyOverrideFilters(
    args.overrides,
    allSlots,
    args.url,
    args.applyFilters
  );
  return { ...filteredOverrides, ...interpreted };
}

type ApplyFiltersFn = (value: string, filterString: string, currentUrl?: string) => string;

// Runs each override value through its slot's filterChain so callers that
// pre-resolve a slot get the same final shape as the interpreter path.
// Override keys without a matching slot, and slots without a filterChain,
// pass through unchanged.
function applyOverrideFilters(
  overrides: Record<string, string>,
  slots: InterpreterSlot[],
  url: string,
  applyFilters: ApplyFiltersFn
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const slot = slots.find((s) => s.key === key);
    out[key] = slot?.filterChain ? applyFilters(value, slot.filterChain, url) : value;
  }
  return out;
}

// Recognizes URLs whose <title> is a known JS-shell sentinel (e.g. X / Twitter's
// "JavaScript is not available." page) and refuses to render unless the caller has
// supplied the variableOverrides that would replace the unusable values. The check
// runs once, before any branching, so all three downstream paths (peek, server-side
// interpreter, fully-resolved render) get the same protection.
function assertSourceUsable(
  url: string,
  html: string,
  variableOverrides: Record<string, string>
): void {
  const { document } = parseHTML(html);
  const rawTitle = document.querySelector("title")?.textContent ?? undefined;
  const sentinel = detectSentinel(rawTitle);
  if (!sentinel) return;

  const missing = sentinel.requiredOverrides.filter(
    (key) => !variableOverrides[key]
  );
  if (missing.length === 0) return;

  throw new SourceNeedsOverridesError({
    url,
    sourceLabel: sentinel.sourceLabel,
    detectedSentinel: (rawTitle ?? "").trim(),
    requiredOverrides: sentinel.requiredOverrides,
    missingOverrides: missing,
    hint: sentinel.hint,
  });
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

async function buildPageContent(
  url: string,
  html: string,
  variableOverrides: Record<string, string>
): Promise<PageContent> {
  const ctx = await buildPageContext(url, html, variableOverrides);
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
  html: string,
  variableOverrides: Record<string, string>
): Promise<{ url: string; title: string | undefined; body: string }> {
  const { document } = parseHTML(html);
  const titleOverride = variableOverrides.title;
  const title = titleOverride ?? (document.querySelector("title")?.textContent ?? undefined);
  // `content` override is the caller's authoritative body (e.g. bird-fetched thread
  // markdown for an X URL where defuddle can't see the JS-rendered content).
  // Use it for interpreter context so the LLM resolves slots against real material.
  const body = variableOverrides.content ?? extractTextBody(document);
  return { url, title, body };
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
