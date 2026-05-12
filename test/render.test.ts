import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { render } from "../src/render.ts";
import { renderFromSettings } from "../src/render-from-settings.ts";
import type { ClipperTemplate, ProviderConfig } from "../src/types.ts";

const fixtures = join(import.meta.dir, "fixtures");

async function articleHtml(): Promise<string> {
  return await readFile(join(fixtures, "article.html"), "utf-8");
}

const deterministicTemplate: ClipperTemplate = {
  schemaVersion: "0.1.0",
  name: "Det",
  behavior: "create",
  noteNameFormat: "{{title}} - {{site}}",
  noteContentFormat: "{{content}}",
  path: "Clippings",
  properties: [
    { name: "title", value: "{{title}}", type: "text" },
    { name: "url", value: '{{url|split:"?"|slice:0,1}}', type: "text" },
    { name: "author", value: "{{author}}", type: "text" },
    { name: "static", value: "literal", type: "text" },
  ],
  triggers: [],
};

const interpreterTemplate: ClipperTemplate = {
  ...deterministicTemplate,
  name: "Interp",
  noteContentFormat: 'Summary: {{"summarize the article in one sentence"}}\n\n{{content}}',
  properties: [
    ...deterministicTemplate.properties,
    { name: "tags", value: '{{"three lowercase tags"}}', type: "multitext" },
  ],
};

describe("render — deterministic", () => {
  test("produces a rendered note with correct frontmatter and body", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article?utm=foo",
      template: deterministicTemplate,
      fetchHtml: async () => html,
    });
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;
    expect(result.filename).toContain("Pragmatic Note Taker");
    expect(result.frontmatter).toContain('title: "The Pragmatic Note Taker"');
    expect(result.frontmatter).toContain('url: "https://example.com/article"');
    expect(result.frontmatter).toContain('author: "Sam Example"');
    expect(result.frontmatter).toContain('static: "literal"');
    expect(result.content).toContain("Note-taking systems fail");
  });
});

describe("render — chat path", () => {
  test("returns needs_interpretation when no providerConfig and slots exist", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      fetchHtml: async () => html,
    });
    expect(result.status).toBe("needs_interpretation");
    if (result.status !== "needs_interpretation") return;
    expect(result.unresolvedSlots.length).toBeGreaterThanOrEqual(2);
    expect(result.pageContent.trusted).toBe(false);
    expect(result.pageContent.source).toBe("external_url");
    expect(result.pageContent.body.length).toBeGreaterThan(0);
  });

  test("renders deterministically when slot_overrides cover all slots", async () => {
    const html = await articleHtml();
    const peek = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      fetchHtml: async () => html,
    });
    expect(peek.status).toBe("needs_interpretation");
    if (peek.status !== "needs_interpretation") return;

    const overrides: Record<string, string> = {};
    for (const slot of peek.unresolvedSlots) overrides[slot.key] = "filled-by-test";

    const result = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      fetchHtml: async () => html,
      slotOverrides: overrides,
    });
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;
    expect(result.content).toContain("Summary: filled-by-test");
    expect(result.frontmatter).toContain('tags:\n  - "filled-by-test"');
  });
});

describe("render — server-side LLM dispatch", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("dispatches interpreter once for all unresolved slots (batched)", async () => {
    const html = await articleHtml();
    const calls: Array<{ url: string; body: unknown }> = [];

    const peek = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      fetchHtml: async () => html,
    });
    expect(peek.status).toBe("needs_interpretation");
    if (peek.status !== "needs_interpretation") return;
    const responseObj: Record<string, string> = {};
    for (const slot of peek.unresolvedSlots) responseObj[slot.key] = "MOCK_VALUE";

    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: JSON.parse(init?.body ?? "{}") });
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: JSON.stringify({ prompts_responses: responseObj }) },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const provider: ProviderConfig = {
      provider: "anthropic",
      apiKey: "test",
      baseUrl: "https://api.anthropic.com/v1/messages",
      model: "claude-test",
    };

    const result = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      providerConfig: provider,
      fetchHtml: async () => html,
    });

    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;
    expect(result.content).toContain("Summary: MOCK_VALUE");
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
  });
});

describe("render — variable overrides", () => {
  test("variableOverrides.content replaces defuddle's content in rendered body", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article",
      template: deterministicTemplate,
      fetchHtml: async () => html,
      variableOverrides: { content: "OVERRIDDEN BODY MARKDOWN" },
    });
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;
    expect(result.content).toContain("OVERRIDDEN BODY MARKDOWN");
    expect(result.content).not.toContain("Note-taking systems fail");
  });

  test("non-overridden variables still come from defuddle", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article",
      template: deterministicTemplate,
      fetchHtml: async () => html,
      variableOverrides: { content: "OVERRIDDEN" },
    });
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;
    expect(result.frontmatter).toContain('title: "The Pragmatic Note Taker"');
    expect(result.frontmatter).toContain('author: "Sam Example"');
  });

  test("variableOverrides override frontmatter property values too", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article",
      template: deterministicTemplate,
      fetchHtml: async () => html,
      variableOverrides: { author: "Bird-Fetched Author" },
    });
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") return;
    expect(result.frontmatter).toContain('author: "Bird-Fetched Author"');
  });

  test("content override flows into needs_interpretation page body", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      fetchHtml: async () => html,
      variableOverrides: { content: "EXTERNALLY FETCHED BODY" },
    });
    expect(result.status).toBe("needs_interpretation");
    if (result.status !== "needs_interpretation") return;
    expect(result.pageContent.body).toBe("EXTERNALLY FETCHED BODY");
  });

  test("title override flows into needs_interpretation page title", async () => {
    const html = await articleHtml();
    const result = await render({
      url: "https://example.com/article",
      template: interpreterTemplate,
      fetchHtml: async () => html,
      variableOverrides: { title: "Overridden Title" },
    });
    expect(result.status).toBe("needs_interpretation");
    if (result.status !== "needs_interpretation") return;
    expect(result.pageContent.title).toBe("Overridden Title");
  });

  test("no overrides → identical behavior to baseline (regression guard)", async () => {
    const html = await articleHtml();
    const baseline = await render({
      url: "https://example.com/article",
      template: deterministicTemplate,
      fetchHtml: async () => html,
    });
    const withEmpty = await render({
      url: "https://example.com/article",
      template: deterministicTemplate,
      fetchHtml: async () => html,
      variableOverrides: {},
    });
    expect(baseline.status).toBe("rendered");
    expect(withEmpty.status).toBe("rendered");
    if (baseline.status !== "rendered" || withEmpty.status !== "rendered") return;
    expect(withEmpty.content).toBe(baseline.content);
    expect(withEmpty.frontmatter).toBe(baseline.frontmatter);
  });
});

describe("renderFromSettings", () => {
  test("loads template by name and renders deterministically", async () => {
    const html = await articleHtml();
    const result = await renderFromSettings({
      url: "https://example.com/article",
      settingsPath: join(fixtures, "single-template.json"),
      templateName: "Test Article",
      fetchHtml: async () => html,
    });
    expect(result.status).toBe("rendered");
    expect(result.template.name).toBe("Test Article");
  });

  test("throws helpful error when template name not found", async () => {
    await expect(
      renderFromSettings({
        url: "https://example.com/x",
        settingsPath: join(fixtures, "single-template.json"),
        templateName: "Missing",
        fetchHtml: async () => "<html></html>",
      })
    ).rejects.toThrow(/Available: Test Article/);
  });
});
