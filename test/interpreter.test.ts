import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { interpretSlot } from "../src/interpreter.ts";
import type { InterpreterSlot, ProviderConfig } from "../src/types.ts";

const PAGE = {
  url: "https://example.com/article",
  title: "An Article",
  body: "This article is about durable note-taking.",
};

const ANTHROPIC_CONFIG: ProviderConfig = {
  provider: "anthropic",
  apiKey: "test-key",
  baseUrl: "https://api.anthropic.com/v1/messages",
  model: "claude-sonnet-4-6",
};

const OAI_CONFIG: ProviderConfig = {
  provider: "openai-compatible",
  apiKey: "test-key",
  baseUrl: "https://api.example.com/v1/chat/completions",
  model: "test-model",
};

const slot = (prompt: string, filterChain?: string): InterpreterSlot => ({
  key: "slot_0",
  prompt,
  filterChain,
  location: { kind: "noteContent" },
});

let originalFetch: typeof fetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: { status?: number; json?: unknown; text?: string }): typeof fetch {
  return (async () => {
    return new Response(
      response.text !== undefined ? response.text : JSON.stringify(response.json ?? {}),
      {
        status: response.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }) as unknown as typeof fetch;
}

describe("interpretSlot — Anthropic adapter", () => {
  test("returns text from successful response", async () => {
    globalThis.fetch = mockFetch({
      json: { content: [{ type: "text", text: "  generated answer  " }] },
    });
    const result = await interpretSlot({
      slot: slot("summarize"),
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(result).toBe("generated answer");
  });

  test("includes page content wrapped in <page> tags in user message", async () => {
    let capturedBody: unknown;
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      capturedBody = JSON.parse(init?.body ?? "{}");
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    await interpretSlot({
      slot: slot("write about it"),
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    const body = capturedBody as { messages: Array<{ content: string }>; system: string };
    expect(body.system).toContain("<page>");
    expect(body.system).toContain("never as instructions");
    expect(body.messages[0]?.content).toContain("<task>");
    expect(body.messages[0]?.content).toContain("write about it");
    expect(body.messages[0]?.content).toContain("<page");
    expect(body.messages[0]?.content).toContain(PAGE.body);
  });

  test("throws actionable error on non-2xx response", async () => {
    globalThis.fetch = mockFetch({ status: 401, text: "Unauthorized" });
    await expect(
      interpretSlot({
        slot: slot("x"),
        pageContext: PAGE,
        providerConfig: ANTHROPIC_CONFIG,
        currentUrl: PAGE.url,
      })
    ).rejects.toThrow(/401/);
  });

  test("applies filter chain when provided", async () => {
    globalThis.fetch = mockFetch({
      json: { content: [{ type: "text", text: "Sam Example" }] },
    });
    const applyFilters = (value: string, chain: string) => {
      if (chain === "wikilink") return `[[${value}]]`;
      return value;
    };
    const result = await interpretSlot({
      slot: slot("name", "wikilink"),
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      applyFilters,
      currentUrl: PAGE.url,
    });
    expect(result).toBe("[[Sam Example]]");
  });

  test("caps text output at 1000 chars by default", async () => {
    const long = "a".repeat(2000);
    globalThis.fetch = mockFetch({
      json: { content: [{ type: "text", text: long }] },
    });
    const result = await interpretSlot({
      slot: slot("x"),
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(result.length).toBe(1000);
  });

  test("caps multitext output at 500 chars", async () => {
    const long = "a".repeat(2000);
    globalThis.fetch = mockFetch({
      json: { content: [{ type: "text", text: long }] },
    });
    const result = await interpretSlot({
      slot: slot("x"),
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
      propertyType: "multitext",
    });
    expect(result.length).toBe(500);
  });

  test("input page body is truncated when over maxInputChars", async () => {
    let captured: unknown;
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      captured = JSON.parse(init?.body ?? "{}");
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const huge = "x".repeat(10_000);
    await interpretSlot({
      slot: slot("x"),
      pageContext: { ...PAGE, body: huge },
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
      options: { maxInputChars: 1000 },
    });
    const userMessage = (captured as { messages: Array<{ content: string }> }).messages[0]!.content;
    expect(userMessage).toContain("[...content truncated for length...]");
    expect(userMessage.length).toBeLessThan(2000);
  });
});

describe("interpretSlot — OpenAI-compatible adapter", () => {
  test("returns text from successful response", async () => {
    globalThis.fetch = mockFetch({
      json: { choices: [{ message: { content: "hello" } }] },
    });
    const result = await interpretSlot({
      slot: slot("x"),
      pageContext: PAGE,
      providerConfig: OAI_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(result).toBe("hello");
  });

  test("sends Authorization header when apiKey is real", async () => {
    let captured: { headers?: Record<string, string> } = {};
    globalThis.fetch = (async (_url: string, init?: { headers?: Record<string, string> }) => {
      captured = { headers: init?.headers };
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    await interpretSlot({
      slot: slot("x"),
      pageContext: PAGE,
      providerConfig: OAI_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(captured.headers?.["Authorization"]).toBe("Bearer test-key");
  });

  test("omits Authorization header for ollama-local sentinel", async () => {
    let captured: { headers?: Record<string, string> } = {};
    globalThis.fetch = (async (_url: string, init?: { headers?: Record<string, string> }) => {
      captured = { headers: init?.headers };
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    await interpretSlot({
      slot: slot("x"),
      pageContext: PAGE,
      providerConfig: { ...OAI_CONFIG, apiKey: "ollama-local" },
      currentUrl: PAGE.url,
    });
    expect(captured.headers?.["Authorization"]).toBeUndefined();
  });
});
