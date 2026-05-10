// ABOUTME: Trigger-based template auto-matching using upstream's matchTemplate.
// Tries URL-prefix and regex triggers first (cheap, no parsing). Falls back to
// schema:@Type triggers by defuddling the page once if any template uses them.

import { parseHTML } from "linkedom";
import { installPolyfills } from "./polyfills.ts";
import type { ClipperSettings, ClipperTemplate } from "./types.ts";

export type MatchOptions = {
  url: string;
  settings: ClipperSettings;
  fetchHtml?: (url: string) => Promise<string>;
  prefetchedHtml?: string;
};

export class TemplateMatchFailedError extends Error {
  constructor(
    public readonly url: string,
    public readonly templatesWithTriggers: string[],
    public readonly allTemplates: string[]
  ) {
    const triggerList =
      templatesWithTriggers.length > 0
        ? templatesWithTriggers.join(", ")
        : "(none — no templates have triggers configured)";
    const allList = allTemplates.join(", ") || "(none)";
    super(
      `No template triggers matched URL ${url}. Templates with triggers: ${triggerList}. ` +
        `All available templates (for explicit selection): ${allList}.`
    );
    this.name = "TemplateMatchFailedError";
  }
}

export async function matchTemplateByUrl(
  options: MatchOptions
): Promise<{ template: ClipperTemplate; usedSchema: boolean; html?: string }> {
  installPolyfills();
  const { matchTemplate } = await import("obsidian-clipper/api");

  const urlMatched = matchTemplate(
    options.settings.templates as unknown as unknown[],
    options.url
  ) as ClipperTemplate | undefined;

  if (urlMatched) {
    return { template: urlMatched, usedSchema: false };
  }

  const hasSchemaTriggers = options.settings.templates.some((t) =>
    t.triggers?.some((trigger) => trigger.startsWith("schema:"))
  );

  if (!hasSchemaTriggers) {
    throw new TemplateMatchFailedError(
      options.url,
      collectTemplatesWithTriggers(options.settings),
      options.settings.templates.map((t) => t.name)
    );
  }

  const html =
    options.prefetchedHtml ??
    (options.fetchHtml ? await options.fetchHtml(options.url) : await defaultFetch(options.url));

  const { default: DefuddleClass } = await import("defuddle");
  const { document } = parseHTML(html);
  const defuddleResult = new DefuddleClass(document as unknown as Document, {
    url: options.url,
  }).parse();

  const schemaMatched = matchTemplate(
    options.settings.templates as unknown as unknown[],
    options.url,
    defuddleResult.schemaOrgData
  ) as ClipperTemplate | undefined;

  if (!schemaMatched) {
    throw new TemplateMatchFailedError(
      options.url,
      collectTemplatesWithTriggers(options.settings),
      options.settings.templates.map((t) => t.name)
    );
  }

  return { template: schemaMatched, usedSchema: true, html };
}

function collectTemplatesWithTriggers(settings: ClipperSettings): string[] {
  return settings.templates
    .filter((t) => t.triggers && t.triggers.length > 0)
    .map((t) => t.name);
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
