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
    max_tokens: req.maxOutputTokens,
    temperature: 0.2,
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
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`Provider returned error: ${json.error.message ?? "unknown"}`);
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Provider response missing choices[0].message.content");
  }
  return content;
}
