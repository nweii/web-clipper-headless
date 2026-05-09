// ABOUTME: Convenience wrapper that resolves a template by name from a settings JSON,
// resolves credentials via the documented chain, and calls render(). Useful when callers
// don't already have a template object in hand.

import { findTemplate, loadSettings } from "./settings.ts";
import { render } from "./render.ts";
import { resolveCredential, type CredentialSource } from "./credentials.ts";
import type { ClipperTemplate, RenderOptions, RenderResult } from "./types.ts";

export type RenderFromSettingsOptions = Omit<RenderOptions, "template" | "providerConfig"> & {
  settingsPath: string;
  templateName: string;
  credentialSource?: CredentialSource;
  useInterpreter?: boolean;
};

export async function renderFromSettings(
  opts: RenderFromSettingsOptions
): Promise<RenderResult & { template: ClipperTemplate }> {
  const settings = await loadSettings(opts.settingsPath);
  const template = findTemplate(settings, opts.templateName);

  let providerConfig: RenderOptions["providerConfig"];
  if (opts.useInterpreter) {
    const credential = resolveCredential(settings, opts.credentialSource ?? "auto");
    providerConfig = credential.config;
    console.error(
      `[web-clipper-headless] interpreter: ${credential.resolution.providerName} via ${credential.resolution.keySource} (env=${credential.resolution.envVar || "(n/a)"})`
    );
  }

  const result = await render({
    url: opts.url,
    template,
    providerConfig,
    slotOverrides: opts.slotOverrides,
    fetchHtml: opts.fetchHtml,
  });

  return { ...result, template };
}
