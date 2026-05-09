import { describe, expect, test } from "bun:test";
import { findInterpreterSlots, substituteSlots } from "../src/tokens.ts";
import type { ClipperTemplate } from "../src/types.ts";

function makeTemplate(overrides: Partial<ClipperTemplate> = {}): ClipperTemplate {
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

describe("findInterpreterSlots", () => {
  test("returns empty when template has no interpreter tokens", () => {
    const template = makeTemplate({
      properties: [{ name: "title", value: "{{title}}", type: "text" }],
    });
    expect(findInterpreterSlots(template)).toHaveLength(0);
  });

  test("finds tokens in noteContentFormat", () => {
    const template = makeTemplate({
      noteContentFormat: 'Summary: {{"summarize"}} END',
    });
    const slots = findInterpreterSlots(template);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.prompt).toBe("summarize");
    expect(slots[0]?.location).toEqual({ kind: "noteContent" });
  });

  test("finds tokens with filter chains", () => {
    const template = makeTemplate({
      noteContentFormat: '{{"three tags"|split:","|slice:0,2}}',
    });
    const slots = findInterpreterSlots(template);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.filterChain).toBe('split:","|slice:0,2');
  });

  test("finds tokens in property values with location info", () => {
    const template = makeTemplate({
      properties: [
        { name: "tags", value: '{{"3 tags"}}', type: "multitext" },
        { name: "static", value: "literal", type: "text" },
      ],
    });
    const slots = findInterpreterSlots(template);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.location).toEqual({ kind: "property", propertyName: "tags" });
  });

  test("handles JSON-escaped quotes inside prompts", () => {
    const template = makeTemplate({
      noteContentFormat: '{{\\"quoted prompt\\"}}',
    });
    const slots = findInterpreterSlots(template);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.prompt).toBe("quoted prompt");
  });

  test("assigns stable, unique keys", () => {
    const template = makeTemplate({
      noteContentFormat: '{{"a"}} {{"b"}}',
      properties: [{ name: "x", value: '{{"c"}}', type: "text" }],
    });
    const slots = findInterpreterSlots(template);
    const keys = slots.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("substituteSlots", () => {
  test("replaces tokens with resolved values", () => {
    const template = makeTemplate({
      noteContentFormat: 'Summary: {{"summarize"}} END',
    });
    const slots = findInterpreterSlots(template);
    const key = slots[0]!.key;
    const result = substituteSlots(template, { [key]: "hello world" });
    expect(result.noteContentFormat).toBe("Summary: hello world END");
  });

  test("preserves non-token text", () => {
    const template = makeTemplate({
      noteContentFormat: '{{title}} -- {{"prompt"}} -- {{content}}',
    });
    const slots = findInterpreterSlots(template);
    const key = slots[0]!.key;
    const result = substituteSlots(template, { [key]: "RESOLVED" });
    expect(result.noteContentFormat).toBe("{{title}} -- RESOLVED -- {{content}}");
  });

  test("escapes braces in resolved values to prevent re-evaluation", () => {
    const template = makeTemplate({
      noteContentFormat: '{{"prompt"}}',
    });
    const slots = findInterpreterSlots(template);
    const key = slots[0]!.key;
    const result = substituteSlots(template, { [key]: "evil {{title}} payload" });
    expect(result.noteContentFormat).toContain("\\{{");
    expect(result.noteContentFormat).not.toMatch(/(?<!\\)\{\{title\}\}/);
  });

  test("missing override resolves to empty string", () => {
    const template = makeTemplate({
      noteContentFormat: 'A {{"x"}} B',
    });
    const result = substituteSlots(template, {});
    expect(result.noteContentFormat).toBe("A  B");
  });

  test("substitutes inside property values", () => {
    const template = makeTemplate({
      properties: [{ name: "tags", value: '{{"tags"}}', type: "multitext" }],
    });
    const slots = findInterpreterSlots(template);
    const key = slots[0]!.key;
    const result = substituteSlots(template, { [key]: "a, b, c" });
    expect(result.properties[0]?.value).toBe("a, b, c");
  });
});
