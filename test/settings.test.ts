import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findTemplate, loadSettings, parseClipperSettings } from "../src/settings.ts";

const fixtures = join(import.meta.dir, "fixtures");

describe("parseClipperSettings", () => {
  test("loads a single-template export", async () => {
    const settings = await loadSettings(join(fixtures, "single-template.json"));
    expect(settings.templates).toHaveLength(1);
    expect(settings.templates[0]?.name).toBe("Test Article");
    expect(settings.interpreterSettings).toBeUndefined();
  });

  test("loads a full-settings export", async () => {
    const settings = await loadSettings(join(fixtures, "full-settings.json"));
    expect(settings.templates).toHaveLength(2);
    expect(settings.templates.map((t) => t.name).sort()).toEqual(["Interpreted", "Plain"]);
    expect(settings.interpreterSettings?.enabled).toBe(true);
    expect(settings.interpreterSettings?.providers).toHaveLength(1);
    expect(settings.interpreterSettings?.providers[0]?.name).toBe("Anthropic");
  });

  test("rejects unrecognized JSON shape", () => {
    expect(() => parseClipperSettings({ random: "thing" })).toThrow(/Unrecognized/);
  });
});

describe("findTemplate", () => {
  test("returns matched template by name", async () => {
    const settings = await loadSettings(join(fixtures, "full-settings.json"));
    const template = findTemplate(settings, "Plain");
    expect(template.name).toBe("Plain");
  });

  test("error message lists available templates", async () => {
    const settings = await loadSettings(join(fixtures, "full-settings.json"));
    expect(() => findTemplate(settings, "Missing")).toThrow(/Available: Plain, Interpreted/);
  });
});

describe("loadSettings folder mode", () => {
  test("loads templates from a directory containing both shapes", async () => {
    const settings = await loadSettings(fixtures);
    const names = settings.templates.map((t) => t.name).sort();
    expect(names).toContain("Test Article");
    expect(names).toContain("Plain");
    expect(names).toContain("Interpreted");
  });
});
