// ABOUTME: Walks template strings to find {{"prompt"|filter|chain}} interpreter tokens.
// ABOUTME: Generates stable keys for each slot's location and supports literal substitution.

import type { ClipperTemplate, InterpreterSlot, SlotLocation } from "./types.ts";

const INTERPRETER_TOKEN_RE = /\{\{\s*\\?"((?:[^"\\]|\\.)*)\\?"\s*((?:\|[^}]+)?)\s*\}\}/g;

export function findInterpreterSlots(template: ClipperTemplate): InterpreterSlot[] {
  const slots: InterpreterSlot[] = [];
  let counter = 0;

  const collect = (text: string, location: SlotLocation) => {
    for (const match of text.matchAll(INTERPRETER_TOKEN_RE)) {
      const prompt = unescapeJsonString(match[1] ?? "");
      const filterChain = (match[2] ?? "").replace(/^\|/, "").trim() || undefined;
      slots.push({
        key: `slot_${counter++}`,
        prompt,
        filterChain,
        location,
      });
    }
  };

  collect(template.noteNameFormat, { kind: "noteName" });
  collect(template.noteContentFormat, { kind: "noteContent" });

  for (const prop of template.properties) {
    collect(prop.value, { kind: "property", propertyName: prop.name });
  }

  return slots;
}

export function substituteSlots(
  template: ClipperTemplate,
  resolvedValues: Record<string, string>
): ClipperTemplate {
  const slots = findInterpreterSlots(template);

  const slotsByLocation = new Map<string, InterpreterSlot[]>();
  for (const slot of slots) {
    const key = locationKey(slot.location);
    const list = slotsByLocation.get(key) ?? [];
    list.push(slot);
    slotsByLocation.set(key, list);
  }

  const replaceInString = (text: string, locationKeyStr: string): string => {
    const slotsHere = slotsByLocation.get(locationKeyStr);
    if (!slotsHere || slotsHere.length === 0) return text;

    let i = 0;
    return text.replace(INTERPRETER_TOKEN_RE, () => {
      const slot = slotsHere[i++];
      if (!slot) return "";
      return escapeForTemplate(resolvedValues[slot.key] ?? "");
    });
  };

  return {
    ...template,
    noteNameFormat: replaceInString(
      template.noteNameFormat,
      locationKey({ kind: "noteName" })
    ),
    noteContentFormat: replaceInString(
      template.noteContentFormat,
      locationKey({ kind: "noteContent" })
    ),
    properties: template.properties.map((prop) => ({
      ...prop,
      value: replaceInString(
        prop.value,
        locationKey({ kind: "property", propertyName: prop.name })
      ),
    })),
  };
}

function locationKey(loc: SlotLocation): string {
  if (loc.kind === "property") return `property:${loc.propertyName}`;
  return loc.kind;
}

function unescapeJsonString(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function escapeForTemplate(value: string): string {
  return value.replace(/\{\{/g, "\\{{").replace(/\}\}/g, "\\}}");
}
