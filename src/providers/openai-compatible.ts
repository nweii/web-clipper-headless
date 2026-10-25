// ABOUTME: OpenAI-compatible chat completions adapter. Targets any provider exposing the
// standard /chat/completions endpoint shape (OpenAI, Google Gemini OAI endpoint,
// OpenRouter, DeepSeek, Groq, Mistral, Perplexity, Grok, Ollama, etc.).

import type { ProviderConfig } from "../types.ts";

export type ChatRequest = {
  systemPrompt: string;
  userMessage: string;
  maxOutputTokens: number;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function inferEndpoint(baseUrl: string | undefined): string {
  const base = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/messages")) {
    throw new Error(
      "openai-compatible adapter received an Anthropic /messages baseUrl; route through the anthropic adapter instead."
    );
  }
  if (base.endsWith("/v1") || base.endsWith("/v1beta") || base.endsWith("/openai/v1")) {
    return `${base}/chat/completions`;
  }
  return base;
}

// OpenAI's own endpoints replaced max_tokens with max_completion_tokens, and its reasoning
// models reject both max_tokens and any non-default temperature. Other OpenAI-compatible
// providers still expect max_tokens, and some reject fields they don't know.
function isOpenAIHost(endpoint: string): boolean {
  const host = new URL(endpoint).hostname;
  return host === "api.openai.com" || host.endsWith(".openai.azure.com");
}

function samplingParams(endpoint: string, maxOutputTokens: number): Record<string, number> {
  if (isOpenAIHost(endpoint)) return { max_completion_tokens: maxOutputTokens };
  return { max_tokens: maxOutputTokens, temperature: 0.2 };
}

export async function callOpenAICompatible(
  config: ProviderConfig,
  req: ChatRequest
): Promise<string> {
  const endpoint = inferEndpoint(config.baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey && config.apiKey !== "ollama-local") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userMessage },
    ],
    ...samplingParams(endpoint, req.maxOutputTokens),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Provider call failed (${response.status} ${response.statusText}): ${errBody.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`Provider returned error: ${json.error.message ?? "unknown"}`);
  }

  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length" && !choice.message?.content) {
    throw new Error(
      `Provider hit the ${req.maxOutputTokens}-token output limit before answering; reasoning models can spend it all thinking. Raise maxResponseTokens.`
    );
  }

  const content = choice?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Provider response missing choices[0].message.content");
  }
  return content;
}
