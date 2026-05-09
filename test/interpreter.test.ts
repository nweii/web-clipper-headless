import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { interpretSlots, parseInterpreterJson } from "../src/interpreter.ts";
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

const slot = (key: string, prompt: string, filterChain?: string): InterpreterSlot => ({
  key,
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

function mockFetchAnthropic(text: string, status = 200): typeof fetch {
  return (async () => {
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function mockFetchOAI(text: string, status = 200): typeof fetch {
  return (async () => {
    return new Response(
      JSON.stringify({ choices: [{ message: { content: text } }] }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;
}

describe("interpretSlots — batched dispatch", () => {
  test("returns empty result when no slots", async () => {
    const result = await interpretSlots({
      slots: [],
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(result).toEqual({});
  });

  test("makes one HTTP call regardless of slot count", async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: '{"prompts_responses":{"slot_0":"a","slot_1":"b","slot_2":"c"}}',
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await interpretSlots({
      slots: [slot("slot_0", "first"), slot("slot_1", "second"), slot("slot_2", "third")],
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(callCount).toBe(1);
    expect(result).toEqual({ slot_0: "a", slot_1: "b", slot_2: "c" });
  });

  test("sends prompts dict in user message", async () => {
    let captured: { messages: Array<{ content: string }> } | undefined;
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      captured = JSON.parse(init?.body ?? "{}");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"prompts_responses":{"slot_0":"x"}}' }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;
    await interpretSlots({
      slots: [slot("slot_0", "extract author")],
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    const userContent = captured!.messages[0]!.content;
    expect(userContent).toContain("<page");
    expect(userContent).toContain("This article is about");
    expect(userContent).toContain('"prompts"');
    expect(userContent).toContain("extract author");
    expect(userContent).toContain("slot_0");
  });

  test("system prompt asks for JSON object output, no markdown fences", async () => {
    let captured: { system: string } | undefined;
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      captured = JSON.parse(init?.body ?? "{}");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"prompts_responses":{"slot_0":"x"}}' }],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    await interpretSlots({
      slots: [slot("slot_0", "x")],
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(captured!.system).toContain("prompts_responses");
    expect(captured!.system).toContain("untrusted");
    expect(captured!.system).toContain("no preamble");
  });

  test("applies filter chain to each slot's value", async () => {
    globalThis.fetch = mockFetchAnthropic(
      '{"prompts_responses":{"author":"Sam Example","tags":"a, b, c"}}'
    );
    const applyFilters = (value: string, chain: string) => {
      if (chain === "wikilink") return `[[${value}]]`;
      if (chain.startsWith("split:")) return JSON.stringify(value.split(",").map((s) => s.trim()));
      return value;
    };
    const result = await interpretSlots({
      slots: [
        slot("author", "name", "wikilink"),
        slot("tags", "tags", 'split:","'),
      ],
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      applyFilters,
      currentUrl: PAGE.url,
    });
    expect(result.author).toBe("[[Sam Example]]");
    expect(result.tags).toBe('["a","b","c"]');
  });

  test("caps text vs multitext output independently", async () => {
    const long = "x".repeat(2000);
    globalThis.fetch = mockFetchAnthropic(
      JSON.stringify({ prompts_responses: { text_slot: long, multi_slot: long } })
    );
    const propertyTypes = new Map<string, "text" | "multitext">([
      ["t", "text"],
      ["m", "multitext"],
    ]);
    const slots: InterpreterSlot[] = [
      { key: "text_slot", prompt: "x", location: { kind: "property", propertyName: "t" } },
      { key: "multi_slot", prompt: "x", location: { kind: "property", propertyName: "m" } },
    ];
    const result = await interpretSlots({
      slots,
      pageContext: PAGE,
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
      propertyTypes,
    });
    expect(result.text_slot?.length).toBe(1000);
    expect(result.multi_slot?.length).toBe(500);
  });

  test("input page body is truncated when over maxInputChars", async () => {
    let captured: { messages: Array<{ content: string }> } | undefined;
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      captured = JSON.parse(init?.body ?? "{}");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"prompts_responses":{"slot_0":"ok"}}' }],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const huge = "x".repeat(10_000);
    await interpretSlots({
      slots: [slot("slot_0", "x")],
      pageContext: { ...PAGE, body: huge },
      providerConfig: ANTHROPIC_CONFIG,
      currentUrl: PAGE.url,
      options: { maxInputChars: 1000 },
    });
    const userMessage = captured!.messages[0]!.content;
    expect(userMessage).toContain("[...content truncated for length...]");
    expect(userMessage.length).toBeLessThan(2000);
  });

  test("throws actionable error on non-2xx", async () => {
    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(
      interpretSlots({
        slots: [slot("slot_0", "x")],
        pageContext: PAGE,
        providerConfig: ANTHROPIC_CONFIG,
        currentUrl: PAGE.url,
      })
    ).rejects.toThrow(/401/);
  });
});

describe("interpretSlots — OpenAI-compatible adapter", () => {
  test("parses choices[0].message.content shape", async () => {
    globalThis.fetch = mockFetchOAI('{"prompts_responses":{"slot_0":"hi"}}');
    const result = await interpretSlots({
      slots: [slot("slot_0", "x")],
      pageContext: PAGE,
      providerConfig: OAI_CONFIG,
      currentUrl: PAGE.url,
    });
    expect(result.slot_0).toBe("hi");
  });

  test("omits Authorization for ollama-local sentinel", async () => {
    let captured: Record<string, string> | undefined;
    globalThis.fetch = (async (_url: string, init?: { headers?: Record<string, string> }) => {
      captured = init?.headers;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"prompts_responses":{"slot_0":"x"}}' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await interpretSlots({
      slots: [slot("slot_0", "x")],
      pageContext: PAGE,
      providerConfig: { ...OAI_CONFIG, apiKey: "ollama-local" },
      currentUrl: PAGE.url,
    });
    expect(captured?.["Authorization"]).toBeUndefined();
  });
});

describe("parseInterpreterJson", () => {
  test("parses a clean prompts_responses object", () => {
    const raw = '{"prompts_responses":{"slot_0":"a","slot_1":"b"}}';
    expect(parseInterpreterJson(raw)).toEqual({ slot_0: "a", slot_1: "b" });
  });

  test("strips ```json code fences", () => {
    const raw = '```json\n{"prompts_responses":{"slot_0":"a"}}\n```';
    expect(parseInterpreterJson(raw)).toEqual({ slot_0: "a" });
  });

  test("strips bare ``` code fences", () => {
    const raw = '```\n{"prompts_responses":{"slot_0":"a"}}\n```';
    expect(parseInterpreterJson(raw)).toEqual({ slot_0: "a" });
  });

  test("recovers from a leading preamble before the JSON", () => {
    const raw = 'Here is your response: {"prompts_responses":{"slot_0":"a"}}';
    expect(parseInterpreterJson(raw)).toEqual({ slot_0: "a" });
  });

  test("falls back to top-level keys when prompts_responses is missing", () => {
    const raw = '{"slot_0":"a","slot_1":"b"}';
    expect(parseInterpreterJson(raw)).toEqual({ slot_0: "a", slot_1: "b" });
  });

  test("throws on completely non-JSON output", () => {
    expect(() => parseInterpreterJson("just plain text no json")).toThrow(/no JSON object/);
  });

  test("stringifies non-string values for resilience", () => {
    const raw = '{"prompts_responses":{"slot_0":["a","b"]}}';
    expect(parseInterpreterJson(raw)).toEqual({ slot_0: '["a","b"]' });
  });
});
