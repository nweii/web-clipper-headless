// ABOUTME: Credential resolution chain — env vars first, clipper JSON second, error third.
// Returns a fully-formed ProviderConfig including baseUrl/model from clipper settings
// when present, with env-var key taking precedence over the JSON key.

import { mapProviderName, type ProviderMapping } from "./provider-mapping.ts";
import type { ClipperSettings, ProviderConfig } from "./types.ts";

export type CredentialSource = "env" | "json" | "auto";

export type ResolvedCredential = {
  config: ProviderConfig;
  resolution: {
    keySource: "env" | "json";
    envVar: string;
    providerName: string;
    modelId?: string;
  };
};

export class MissingProviderError extends Error {
  constructor(public readonly checkedEnvVars: string[]) {
    const list = checkedEnvVars.length > 0 ? checkedEnvVars.join(", ") : "(none)";
    super(
      `No interpreter provider configured. Set one of: ${list}, or pass credentialSource: 'json' to read keys from your clipper settings.`
    );
    this.name = "MissingProviderError";
  }
}

export function resolveCredential(
  settings: ClipperSettings,
  source: CredentialSource = "auto"
): ResolvedCredential {
  const interpreter = settings.interpreterSettings;
  if (!interpreter || interpreter.providers.length === 0) {
    throw new MissingProviderError([]);
  }

  const defaultModel = pickDefaultModel(settings);
  const provider = interpreter.providers.find((p) => p.id === defaultModel.providerId);
  if (!provider) {
    throw new Error(
      `Default model '${defaultModel.name}' references provider '${defaultModel.providerId}' that does not exist in interpreter_settings.providers.`
    );
  }

  const mapping = mapProviderName(provider.name);
  const envKey = mapping.envVar ? process.env[mapping.envVar] : undefined;
  const jsonKey = provider.apiKey;

  let apiKey: string | undefined;
  let keySource: "env" | "json";

  if (source === "env") {
    apiKey = envKey;
    keySource = "env";
  } else if (source === "json") {
    apiKey = jsonKey;
    keySource = "json";
  } else {
    if (envKey) {
      apiKey = envKey;
      keySource = "env";
    } else {
      apiKey = jsonKey;
      keySource = "json";
    }
  }

  if (!apiKey && mapping.adapter === "openai-compatible" && provider.baseUrl?.includes("ollama")) {
    apiKey = "ollama-local";
    keySource = source === "env" ? "env" : "json";
  }

  if (!apiKey) {
    throw new MissingProviderError([mapping.envVar].filter(Boolean));
  }

  const config: ProviderConfig = {
    provider: mapping.adapter,
    apiKey,
    baseUrl: provider.baseUrl,
    model: defaultModel.providerModelId,
  };

  return {
    config,
    resolution: {
      keySource,
      envVar: mapping.envVar,
      providerName: provider.name,
      modelId: defaultModel.id,
    },
  };
}

function pickDefaultModel(settings: ClipperSettings): {
  id: string;
  name: string;
  providerId: string;
  providerModelId: string;
} {
  const interp = settings.interpreterSettings!;
  const byId = interp.defaultModelId
    ? interp.models.find((m) => m.id === interp.defaultModelId)
    : undefined;
  const enabled = interp.models.filter((m) => m.enabled);
  const chosen = byId ?? enabled[0] ?? interp.models[0];
  if (!chosen) {
    throw new Error("No interpreter models configured in clipper settings.");
  }
  return chosen;
}

export function describeMapping(name: string): ProviderMapping {
  return mapProviderName(name);
}
