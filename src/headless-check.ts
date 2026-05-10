// ABOUTME: Detects template variables that cannot be populated headlessly because they
// depend on user interaction in the browser extension (highlights, selections). Surfaces
// these via a structured error so callers can re-prompt the user to pick a different
// template or provide the values explicitly later.

import type { ClipperTemplate } from "./types.ts";

const HEADLESS_INCOMPATIBLE_VARIABLES = [
  "highlights",
  "selection",
] as const;

export type HeadlessIncompatibleVariable =
  (typeof HEADLESS_INCOMPATIBLE_VARIABLES)[number];

export class TemplateRequiresUserInputError extends Error {
  constructor(
    public readonly templateName: string,
    public readonly missingVariables: HeadlessIncompatibleVariable[]
  ) {
    const list = missingVariables.map((v) => `{{${v}}}`).join(", ");
    super(
      `Template '${templateName}' uses ${list}, which depends on user interaction in the browser extension and cannot be populated headlessly. ` +
        `Pick a different template (e.g. via template_name), or use the official Web Clipper extension for this URL.`
    );
    this.name = "TemplateRequiresUserInputError";
  }
}

export function findHeadlessIncompatibleVariables(
  template: ClipperTemplate
): HeadlessIncompatibleVariable[] {
  const sources: string[] = [
    template.noteNameFormat ?? "",
    template.noteContentFormat ?? "",
    ...template.properties.map((p) => p.value ?? ""),
  ];

  const found = new Set<HeadlessIncompatibleVariable>();
  for (const src of sources) {
    for (const variable of HEADLESS_INCOMPATIBLE_VARIABLES) {
      const pattern = new RegExp(`\\{\\{\\s*${variable}\\s*(\\||\\}\\})`);
      if (pattern.test(src)) {
        found.add(variable);
      }
    }
  }
  return Array.from(found);
}

export function assertHeadlessCompatible(template: ClipperTemplate): void {
  const missing = findHeadlessIncompatibleVariables(template);
  if (missing.length > 0) {
    throw new TemplateRequiresUserInputError(template.name, missing);
  }
}
