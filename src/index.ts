// ABOUTME: Public entry point. Re-exports the library surface used by consumers and the CLI.

export { render } from "./render.ts";
export { renderFromSettings } from "./render-from-settings.ts";
export { matchTemplateByUrl, TemplateMatchFailedError } from "./match.ts";
export {
  assertHeadlessCompatible,
  findHeadlessIncompatibleVariables,
  TemplateRequiresUserInputError,
} from "./headless-check.ts";
export type { HeadlessIncompatibleVariable } from "./headless-check.ts";
export { installPolyfills } from "./polyfills.ts";
export { loadSettings, parseClipperSettings, findTemplate } from "./settings.ts";
export { findInterpreterSlots, substituteSlots } from "./tokens.ts";
export { interpretSlots, parseInterpreterJson } from "./interpreter.ts";
export {
  resolveCredential,
  describeMapping,
  MissingProviderError,
} from "./credentials.ts";
export { mapProviderName } from "./provider-mapping.ts";
export { scanForInjection } from "./scan.ts";
export type {
  ClipperTemplate,
  ClipperSettings,
  TemplateProperty,
  PropertyType,
  ProviderConfig,
  InterpreterSlot,
  SlotLocation,
  PageContent,
  PreparedState,
  RenderOptions,
  RenderResult,
  RenderedResult,
  NeedsInterpretationResult,
} from "./types.ts";
export type { CredentialSource, ResolvedCredential } from "./credentials.ts";
export type { ProviderMapping } from "./provider-mapping.ts";
export type { InterpreterOptions, PageContext } from "./interpreter.ts";
export type { ScanResult, SuspiciousMatch } from "./scan.ts";
export type { RenderFromSettingsOptions } from "./render-from-settings.ts";
