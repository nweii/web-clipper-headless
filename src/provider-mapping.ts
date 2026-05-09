// ABOUTME: Maps Web Clipper provider name strings to env var conventions and adapter kinds.
// Conventions follow each provider's official SDK so users with existing keys don't rename.

import type { ProviderConfig } from "./types.ts";

type AdapterKind = ProviderConfig["provider"];

type Mapping = {
  match: RegExp;
  envVar: string;
  adapter: AdapterKind;
};

const MAPPINGS: Mapping[] = [
  { match: /azure/i, envVar: "AZURE_OPENAI_API_KEY", adapter: "openai-compatible" },
  { match: /anthropic|claude/i, envVar: "ANTHROPIC_API_KEY", adapter: "anthropic" },
  { match: /openrouter/i, envVar: "OPENROUTER_API_KEY", adapter: "openai-compatible" },
  { match: /google|gemini/i, envVar: "GEMINI_API_KEY", adapter: "openai-compatible" },
  { match: /openai/i, envVar: "OPENAI_API_KEY", adapter: "openai-compatible" },
  { match: /deepseek/i, envVar: "DEEPSEEK_API_KEY", adapter: "openai-compatible" },
  { match: /groq/i, envVar: "GROQ_API_KEY", adapter: "openai-compatible" },
  { match: /mistral/i, envVar: "MISTRAL_API_KEY", adapter: "openai-compatible" },
  { match: /perplexity/i, envVar: "PERPLEXITY_API_KEY", adapter: "openai-compatible" },
  { match: /xai|grok/i, envVar: "XAI_API_KEY", adapter: "openai-compatible" },
  { match: /cohere/i, envVar: "COHERE_API_KEY", adapter: "openai-compatible" },
  { match: /huggingface|hugging\s*face/i, envVar: "HF_TOKEN", adapter: "openai-compatible" },
  { match: /ollama/i, envVar: "", adapter: "openai-compatible" },
];

export type ProviderMapping = {
  envVar: string;
  adapter: AdapterKind;
};

export function mapProviderName(name: string): ProviderMapping {
  for (const m of MAPPINGS) {
    if (m.match.test(name)) {
      return { envVar: m.envVar, adapter: m.adapter };
    }
  }
  const fallback = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return { envVar: `${fallback}_API_KEY`, adapter: "openai-compatible" };
}
