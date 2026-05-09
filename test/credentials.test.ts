import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MissingProviderError, resolveCredential } from "../src/credentials.ts";
import type { ClipperSettings } from "../src/types.ts";

const baseSettings: ClipperSettings = {
  templates: [],
  interpreterSettings: {
    enabled: true,
    defaultModelId: "model-default",
    models: [
      {
        id: "model-default",
        name: "Sonnet",
        providerId: "p-anthropic",
        providerModelId: "claude-sonnet-4-6",
        enabled: true,
      },
      {
        id: "model-fallback",
        name: "Haiku",
        providerId: "p-anthropic",
        providerModelId: "claude-haiku-4-5",
        enabled: true,
      },
    ],
    providers: [
      {
        id: "p-anthropic",
        name: "Anthropic",
        apiKey: "json-key-from-clipper",
        baseUrl: "https://api.anthropic.com/v1/messages",
      },
    ],
  },
};

const ENV_KEY = "ANTHROPIC_API_KEY";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("resolveCredential", () => {
  test("uses env var when set (default 'auto')", () => {
    process.env[ENV_KEY] = "env-key";
    const result = resolveCredential(baseSettings);
    expect(result.config.apiKey).toBe("env-key");
    expect(result.config.provider).toBe("anthropic");
    expect(result.config.model).toBe("claude-sonnet-4-6");
    expect(result.resolution.keySource).toBe("env");
  });

  test("falls back to JSON key when env var is unset", () => {
    const result = resolveCredential(baseSettings);
    expect(result.config.apiKey).toBe("json-key-from-clipper");
    expect(result.resolution.keySource).toBe("json");
  });

  test("source='env' refuses to fall back to JSON", () => {
    expect(() => resolveCredential(baseSettings, "env")).toThrow(MissingProviderError);
  });

  test("source='json' ignores env var", () => {
    process.env[ENV_KEY] = "env-key";
    const result = resolveCredential(baseSettings, "json");
    expect(result.config.apiKey).toBe("json-key-from-clipper");
    expect(result.resolution.keySource).toBe("json");
  });

  test("throws MissingProviderError with helpful env var hint when both empty", () => {
    const settings: ClipperSettings = {
      ...baseSettings,
      interpreterSettings: {
        ...baseSettings.interpreterSettings!,
        providers: [
          {
            id: "p-anthropic",
            name: "Anthropic",
            apiKey: undefined,
            baseUrl: "https://api.anthropic.com/v1/messages",
          },
        ],
      },
    };
    try {
      resolveCredential(settings);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingProviderError);
      expect((err as MissingProviderError).checkedEnvVars).toContain("ANTHROPIC_API_KEY");
    }
  });

  test("Ollama provider does not require an API key", () => {
    const settings: ClipperSettings = {
      templates: [],
      interpreterSettings: {
        enabled: true,
        defaultModelId: "m1",
        models: [
          { id: "m1", name: "llama", providerId: "p1", providerModelId: "llama3", enabled: true },
        ],
        providers: [
          {
            id: "p1",
            name: "Ollama",
            apiKey: undefined,
            baseUrl: "http://localhost:11434/v1/ollama",
          },
        ],
      },
    };
    const result = resolveCredential(settings);
    expect(result.config.apiKey).toBe("ollama-local");
    expect(result.config.provider).toBe("openai-compatible");
  });

  test("throws on empty interpreter settings", () => {
    const empty: ClipperSettings = { templates: [] };
    expect(() => resolveCredential(empty)).toThrow(MissingProviderError);
  });
});
