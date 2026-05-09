// ABOUTME: Anthropic native /v1/messages adapter. System prompt + user message goes through;
// no tools, no streaming. Output validated as text.

import type { ProviderConfig } from "../types.ts";
import type { ChatRequest } from "./openai-compatible.ts";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1/messages";

export async function callAnthropic(
  config: ProviderConfig,
  req: ChatRequest
): Promise<string> {
  const endpoint = config.baseUrl ?? DEFAULT_BASE_URL;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: req.maxOutputTokens,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userMessage }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(
      `Anthropic call failed (${response.status} ${response.statusText}): ${errBody.slice(0, 500)}`
    );
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`Anthropic returned error: ${json.error.message ?? "unknown"}`);
  }

  const text = json.content?.find((b) => b.type === "text")?.text;
  if (typeof text !== "string") {
    throw new Error("Anthropic response missing text content block");
  }
  return text;
}
