// ABOUTME: Unit tests for sanitizeNoteName — the gate that keeps invisible and FS-illegal
// characters from reaching the rendered filename and, therefore, disk.

import { describe, expect, test } from "bun:test";
import { sanitizeNoteName } from "../src/sanitize.ts";

describe("sanitizeNoteName", () => {
  test("strips a leading U+200E (LRM) — the original observed defect", () => {
    expect(sanitizeNoteName("‎Spec — Web clipper")).toBe("Spec — Web clipper");
  });

  test("strips zero-width and bidi marks anywhere in the name", () => {
    // ZWSP, LRM, RLM, LRE, RLE, PDF, LRO, RLO, WORD JOINER, BOM
    const dirty = `​Foo‎‏‪‫‬‭‮⁠Bar﻿`;
    expect(sanitizeNoteName(dirty)).toBe("FooBar");
  });

  test("strips zero-width joiner and non-joiner in filenames (aggressive, by design)", () => {
    // ZWJ/ZWNJ are load-bearing in emoji sequences and Persian/Arabic/Indic body text,
    // but there is no legitimate reason for them inside a filename. Body-level
    // sanitation, if it ever lands, must use a joiner-preserving denylist instead.
    expect(sanitizeNoteName("A‌B‍C")).toBe("ABC");
  });

  test("replaces FS-reserved characters with a hyphen", () => {
    expect(sanitizeNoteName('Foo/Bar\\Baz:Qux*Quux?"<>|End')).toBe(
      "Foo-Bar-Baz-Qux-Quux-----End"
    );
  });

  test("collapses internal whitespace runs and trims edges", () => {
    expect(sanitizeNoteName("  Foo   Bar\t\nBaz  ")).toBe("Foo Bar Baz");
  });

  test("truncates over-length names at 180 characters", () => {
    const long = "x".repeat(300);
    const out = sanitizeNoteName(long);
    expect(out.length).toBe(180);
    expect(out).toBe("x".repeat(180));
  });

  test("leaves a clean name byte-identical (regression guard)", () => {
    const clean = "The Pragmatic Note Taker - Sam Example";
    expect(sanitizeNoteName(clean)).toBe(clean);
  });

  test("handles empty input", () => {
    expect(sanitizeNoteName("")).toBe("");
  });

  test("a name that's pure invisibles collapses to empty", () => {
    expect(sanitizeNoteName("‎‎‎")).toBe("");
  });
});
