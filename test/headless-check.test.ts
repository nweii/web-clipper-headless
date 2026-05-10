import { describe, expect, test } from "bun:test";
import {
  assertHeadlessCompatible,
  findHeadlessIncompatibleVariables,
  TemplateRequiresUserInputError,
} from "../src/headless-check.ts";
import type { ClipperTemplate } from "../src/types.ts";

function makeTemplate(overrides: Partial<ClipperTemplate>): ClipperTemplate {
  return {
    schemaVersion: "0.1.0",
    name: "T",
    behavior: "create",
    noteNameFormat: "{{title}}",
    noteContentFormat: "{{content}}",
    properties: [],
    ...overrides,
  };
}

describe("findHeadlessIncompatibleVariables", () => {
  test("returns empty for headless-safe template", () => {
    const template = makeTemplate({
      noteContentFormat: "{{content}}",
      properties: [{ name: "title", value: "{{title}}", type: "text" }],
    });
    expect(findHeadlessIncompatibleVariables(template)).toEqual([]);
  });

  test("detects {{highlights}} in noteContentFormat", () => {
    const template = makeTemplate({
      noteContentFormat: "Quotes:\n{{highlights}}\n\n{{content}}",
    });
    expect(findHeadlessIncompatibleVariables(template)).toEqual(["highlights"]);
  });

  test("detects {{selection}} in property value", () => {
    const template = makeTemplate({
      properties: [{ name: "excerpt", value: "{{selection}}", type: "text" }],
    });
    expect(findHeadlessIncompatibleVariables(template)).toEqual(["selection"]);
  });

  test("detects both when present", () => {
    const template = makeTemplate({
      noteContentFormat: "{{highlights}}",
      properties: [{ name: "x", value: "{{selection}}", type: "text" }],
    });
    const result = findHeadlessIncompatibleVariables(template);
    expect(result).toContain("highlights");
    expect(result).toContain("selection");
  });

  test("detects with whitespace and filter chains", () => {
    const template = makeTemplate({
      noteContentFormat: '{{ highlights | join:"\n\n" | blockquote }}',
    });
    expect(findHeadlessIncompatibleVariables(template)).toEqual(["highlights"]);
  });

  test("does not match substrings in unrelated text", () => {
    const template = makeTemplate({
      noteContentFormat: "Notes about highlights and selections",
    });
    expect(findHeadlessIncompatibleVariables(template)).toEqual([]);
  });
});

describe("assertHeadlessCompatible", () => {
  test("returns silently for headless-safe templates", () => {
    const template = makeTemplate({});
    expect(() => assertHeadlessCompatible(template)).not.toThrow();
  });

  test("throws TemplateRequiresUserInputError when highlights is used", () => {
    const template = makeTemplate({
      name: "Excerpts",
      noteContentFormat: "{{highlights}}",
    });
    try {
      assertHeadlessCompatible(template);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateRequiresUserInputError);
      const e = err as TemplateRequiresUserInputError;
      expect(e.templateName).toBe("Excerpts");
      expect(e.missingVariables).toEqual(["highlights"]);
      expect(e.message).toContain("{{highlights}}");
      expect(e.message).toContain("Pick a different template");
    }
  });
});
