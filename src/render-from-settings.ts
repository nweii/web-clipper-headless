// ABOUTME: Convenience wrapper that resolves a template by name OR by URL trigger match,
// resolves credentials via the documented chain, and calls render(). Useful when callers
// don't already have a template object in hand.

import { findTemplate, loadSettings } from "./settings.ts";
import { matchTemplateByUrl } from "./match.ts";
import { render } from "./render.ts";
import { resolveCredential, type CredentialSource } from "./credentials.ts";
import type { ClipperTemplate, RenderOptions, RenderResult } from "./types.ts";

export type RenderFromSettingsOptions = Omit<RenderOptions, "template" | "providerConfig"> & {
  settingsPath: string;
  templateName?: string;
  credentialSource?: CredentialSource;
  useInterpreter?: boolean;
};

export async function renderFromSettings(
  opts: RenderFromSettingsOptions
): Promise<RenderResult & { template: ClipperTemplate; matchedBy: "explicit" | "trigger" }> {
  const settings = await loadSettings(opts.settingsPath);

  let template: ClipperTemplate;
  let matchedBy: "explicit" | "trigger";
  let prefetchedHtml: string | undefined;

  if (opts.templateName) {
    template = findTemplate(settings, opts.templateName);
    matchedBy = "explicit";
  } else {
    const match = await matchTemplateByUrl({
      url: opts.url,
      settings,
      fetchHtml: opts.fetchHtml,
    });
    template = match.template;
    matchedBy = "trigger";
    prefetchedHtml = match.html;
    console.error(
      `[web-clipper-headless] auto-matched template '${template.name}' by ${
        match.usedSchema ? "schema trigger" : "URL trigger"
      }`
    );
  }

  let providerConfig: RenderOptions["providerConfig"];
  if (opts.useInterpreter) {
    const credential = resolveCredential(settings, opts.credentialSource ?? "auto");
    providerConfig = credential.config;
    console.error(
      `[web-clipper-headless] interpreter: ${credential.resolution.providerName} via ${credential.resolution.keySource} (env=${credential.resolution.envVar || "(n/a)"})`
    );
  }

  const fetchHtml = prefetchedHtml
    ? async () => prefetchedHtml!
    : opts.fetchHtml;

  const result = await render({
    url: opts.url,
    template,
    providerConfig,
    slotOverrides: opts.slotOverrides,
    variableOverrides: opts.variableOverrides,
    fetchHtml,
  });

  return { ...result, template, matchedBy };
}
