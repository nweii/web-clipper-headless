// ABOUTME: Loads and parses Web Clipper settings JSON, supporting both full-settings exports
// and single-template exports. Detects format by top-level keys.

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ClipperSettings, ClipperTemplate } from "./types.ts";

export async function loadSettings(path: string): Promise<ClipperSettings> {
  const stats = await stat(path);
  if (stats.isDirectory()) {
    return loadSettingsFromDir(path);
  }
  const raw = await readFile(path, "utf-8");
  return parseClipperSettings(JSON.parse(raw));
}

async function loadSettingsFromDir(dir: string): Promise<ClipperSettings> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 0) {
    throw new Error(`No JSON template files found in ${dir}`);
  }

  const fullSettingsCandidates: ClipperSettings[] = [];
  const standaloneTemplates: ClipperTemplate[] = [];

  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf-8");
    const parsed = JSON.parse(raw);
    if (isFullSettings(parsed)) {
      fullSettingsCandidates.push(parseClipperSettings(parsed));
    } else if (isSingleTemplate(parsed)) {
      standaloneTemplates.push(parsed as ClipperTemplate);
    }
  }

  if (fullSettingsCandidates.length > 0) {
    const settings = pickNewestFullSettings(dir, fullSettingsCandidates, jsonFiles);
    return {
      ...settings,
      templates: [...settings.templates, ...standaloneTemplates],
    };
  }

  return { templates: standaloneTemplates };
}

function pickNewestFullSettings(
  _dir: string,
  candidates: ClipperSettings[],
  _files: string[]
): ClipperSettings {
  return candidates[candidates.length - 1] ?? { templates: [] };
}

export function parseClipperSettings(raw: unknown): ClipperSettings {
  if (isSingleTemplate(raw)) {
    return { templates: [raw as ClipperTemplate] };
  }
  if (!isFullSettings(raw)) {
    throw new Error(
      "Unrecognized settings JSON shape. Expected either a single template (with `schemaVersion`) or a full settings export (with `template_*` keys)."
    );
  }

  const obj = raw as Record<string, unknown>;
  const templates: ClipperTemplate[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("template_") && isSingleTemplate(value)) {
      templates.push(value as ClipperTemplate);
    }
  }

  const interpreterSettings = obj.interpreter_settings as
    | {
        interpreterEnabled?: boolean;
        interpreterModel?: string;
        models?: Array<{
          id: string;
          name: string;
          providerId: string;
          providerModelId: string;
          enabled?: boolean;
        }>;
        providers?: Array<{
          id: string;
          name: string;
          apiKey?: string;
          baseUrl?: string;
        }>;
      }
    | undefined;

  return {
    templates,
    interpreterSettings: interpreterSettings
      ? {
          enabled: interpreterSettings.interpreterEnabled ?? false,
          defaultModelId: interpreterSettings.interpreterModel,
          models: (interpreterSettings.models ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            providerId: m.providerId,
            providerModelId: m.providerModelId,
            enabled: m.enabled ?? true,
          })),
          providers: (interpreterSettings.providers ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            apiKey: p.apiKey,
            baseUrl: p.baseUrl,
          })),
        }
      : undefined,
  };
}

export function findTemplate(
  settings: ClipperSettings,
  name: string
): ClipperTemplate {
  const match = settings.templates.find((t) => t.name === name);
  if (!match) {
    const available = settings.templates.map((t) => t.name).join(", ");
    throw new Error(
      `Template '${name}' not found. Available: ${available || "(none)"}`
    );
  }
  return match;
}

function isSingleTemplate(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    "noteContentFormat" in value
  );
}

function isFullSettings(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((k) => k.startsWith("template_"));
}
