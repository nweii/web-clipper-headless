// ABOUTME: Public entry point. Re-exports the library surface used by consumers and the CLI.

export { render } from "./render.ts";
export { installPolyfills } from "./polyfills.ts";
export { loadSettings, parseClipperSettings, findTemplate } from "./settings.ts";
export { findInterpreterSlots, substituteSlots } from "./tokens.ts";
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
