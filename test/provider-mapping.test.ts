import { describe, expect, test } from "bun:test";
import { mapProviderName } from "../src/provider-mapping.ts";
import type { ProviderConfig } from "../src/types.ts";

const cases: Array<[string, string, ProviderConfig["provider"]]> = [
  ["Anthropic", "ANTHROPIC_API_KEY", "anthropic"],
  ["Claude (custom)", "ANTHROPIC_API_KEY", "anthropic"],
  ["OpenAI", "OPENAI_API_KEY", "openai-compatible"],
  ["Azure OpenAI", "AZURE_OPENAI_API_KEY", "openai-compatible"],
  ["Google Gemini", "GOOGLE_GENERATIVE_AI_API_KEY", "openai-compatible"],
  ["Gemini", "GOOGLE_GENERATIVE_AI_API_KEY", "openai-compatible"],
  ["OpenRouter", "OPENROUTER_API_KEY", "openai-compatible"],
  ["DeepSeek", "DEEPSEEK_API_KEY", "openai-compatible"],
  ["Groq", "GROQ_API_KEY", "openai-compatible"],
  ["Mistral", "MISTRAL_API_KEY", "openai-compatible"],
  ["Perplexity", "PERPLEXITY_API_KEY", "openai-compatible"],
  ["Grok", "XAI_API_KEY", "openai-compatible"],
  ["xAI", "XAI_API_KEY", "openai-compatible"],
  ["Cohere", "COHERE_API_KEY", "openai-compatible"],
  ["Hugging Face", "HF_TOKEN", "openai-compatible"],
  ["Ollama (local)", "", "openai-compatible"],
];

describe("mapProviderName", () => {
  test.each(cases)("maps '%s' to %s/%s", (name, envVar, adapter) => {
    const result = mapProviderName(name);
    expect(result.envVar).toBe(envVar);
    expect(result.adapter).toBe(adapter);
  });

  test("falls back to UPPER_SNAKE for unknown provider names", () => {
    expect(mapProviderName("My Custom Endpoint").envVar).toBe("MY_CUSTOM_ENDPOINT_API_KEY");
    expect(mapProviderName("foo-bar baz").envVar).toBe("FOO_BAR_BAZ_API_KEY");
  });

  test("Azure ranks above generic OpenAI", () => {
    expect(mapProviderName("Azure OpenAI").envVar).toBe("AZURE_OPENAI_API_KEY");
  });
});
