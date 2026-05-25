// ABOUTME: Tests for sentinel-source detection — the library's "I know defuddle's title
// is garbage for this URL" recognition rule. Pure unit-level checks here; the integration
// path (through render()) is covered in test/render.test.ts.

import { describe, expect, test } from "bun:test";
import { detectSentinel, SourceNeedsOverridesError } from "../src/sources.ts";

describe("detectSentinel", () => {
  test("matches the X / Twitter JS-shell sentinel", () => {
    const hit = detectSentinel("JavaScript is not available.");
    expect(hit).not.toBeNull();
    expect(hit?.sourceLabel).toContain("X");
    expect(hit?.requiredOverrides).toEqual(["title", "content"]);
  });

  test("matches the sentinel with or without trailing period", () => {
    expect(detectSentinel("JavaScript is not available")).not.toBeNull();
    expect(detectSentinel("JavaScript is not available.")).not.toBeNull();
  });

  test("trims surrounding whitespace before matching", () => {
    expect(detectSentinel("  JavaScript is not available.  ")).not.toBeNull();
  });

  test("does not match a real article that mentions the phrase mid-sentence", () => {
    expect(
      detectSentinel("Why JavaScript is not available on legacy Mars rovers")
    ).toBeNull();
  });

  test("returns null on undefined, null, or empty input", () => {
    expect(detectSentinel(undefined)).toBeNull();
    expect(detectSentinel(null)).toBeNull();
    expect(detectSentinel("")).toBeNull();
    expect(detectSentinel("   ")).toBeNull();
  });

  test("does not over-match a normal title", () => {
    expect(detectSentinel("The Pragmatic Note Taker")).toBeNull();
  });
});

describe("SourceNeedsOverridesError", () => {
  test("carries structured fields and a readable message", () => {
    const err = new SourceNeedsOverridesError({
      url: "https://x.com/user/status/1",
      sourceLabel: "X / Twitter (JS shell)",
      detectedSentinel: "JavaScript is not available.",
      requiredOverrides: ["title", "content"],
      missingOverrides: ["title", "content"],
      hint: "Fetch via your tweet API and retry.",
    });
    expect(err.name).toBe("SourceNeedsOverridesError");
    expect(err.url).toBe("https://x.com/user/status/1");
    expect(err.missingOverrides).toEqual(["title", "content"]);
    expect(err.message).toContain("JavaScript is not available.");
    expect(err.message).toContain("title, content");
    expect(err.message).toContain("Fetch via your tweet API");
  });

  test("is an instance of Error (so callers can use try/catch and instanceof)", () => {
    const err = new SourceNeedsOverridesError({
      url: "https://x.com/x",
      sourceLabel: "X",
      detectedSentinel: "sentinel",
      requiredOverrides: ["title"],
      missingOverrides: ["title"],
    });
    expect(err instanceof Error).toBe(true);
    expect(err instanceof SourceNeedsOverridesError).toBe(true);
  });
});
