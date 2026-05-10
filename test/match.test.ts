import { describe, expect, test } from "bun:test";
import { matchTemplateByUrl, TemplateMatchFailedError } from "../src/match.ts";
import type { ClipperSettings, ClipperTemplate } from "../src/types.ts";

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

describe("matchTemplateByUrl — URL trigger matching", () => {
  test("matches a URL prefix trigger", async () => {
    const settings: ClipperSettings = {
      templates: [
        makeTemplate({ name: "X Posts", triggers: ["https://x.com/"] }),
        makeTemplate({ name: "Letterboxd", triggers: ["https://letterboxd.com/"] }),
        makeTemplate({ name: "No Triggers", triggers: [] }),
      ],
    };
    const result = await matchTemplateByUrl({
      url: "https://x.com/foo/status/123",
      settings,
    });
    expect(result.template.name).toBe("X Posts");
    expect(result.usedSchema).toBe(false);
  });

  test("matches a regex trigger", async () => {
    const settings: ClipperSettings = {
      templates: [
        makeTemplate({
          name: "Google Forms",
          triggers: ["/^https?:\\/\\/docs\\.google\\.com\\/forms/"],
        }),
      ],
    };
    const result = await matchTemplateByUrl({
      url: "https://docs.google.com/forms/d/abc",
      settings,
    });
    expect(result.template.name).toBe("Google Forms");
  });

  test("throws TemplateMatchFailedError when no triggers match and no schema triggers exist", async () => {
    const settings: ClipperSettings = {
      templates: [
        makeTemplate({ name: "X Posts", triggers: ["https://x.com/"] }),
        makeTemplate({ name: "No Triggers", triggers: [] }),
      ],
    };
    try {
      await matchTemplateByUrl({
        url: "https://example.com/article",
        settings,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateMatchFailedError);
      const e = err as TemplateMatchFailedError;
      expect(e.templatesWithTriggers).toEqual(["X Posts"]);
      expect(e.allTemplates).toEqual(["X Posts", "No Triggers"]);
    }
  });

  test("error message lists templates with triggers AND all available templates", async () => {
    const settings: ClipperSettings = {
      templates: [
        makeTemplate({ name: "X Posts", triggers: ["https://x.com/"] }),
        makeTemplate({ name: "Full text", triggers: [] }),
      ],
    };
    try {
      await matchTemplateByUrl({ url: "https://example.com/x", settings });
      throw new Error("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("Templates with triggers: X Posts");
      expect(msg).toContain("All available templates");
      expect(msg).toContain("Full text");
    }
  });

  test("first matching template wins on multiple URL matches", async () => {
    const settings: ClipperSettings = {
      templates: [
        makeTemplate({ name: "Specific", triggers: ["https://example.com/blog/"] }),
        makeTemplate({ name: "Broad", triggers: ["https://example.com/"] }),
      ],
    };
    const result = await matchTemplateByUrl({
      url: "https://example.com/blog/post",
      settings,
    });
    expect(result.template.name).toBe("Specific");
  });
});
