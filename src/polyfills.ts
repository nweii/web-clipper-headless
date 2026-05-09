// ABOUTME: Globals required by defuddle's bundled Turndown when running outside the browser.
// ABOUTME: Mirrors the esbuild banner upstream uses for its CLI build.

import { parseHTML } from "linkedom";

let installed = false;

export function installPolyfills(): void {
  if (installed) return;

  const linkedomParser = class {
    parseFromString(html: string) {
      return parseHTML(html).document;
    }
  };

  const g = globalThis as unknown as {
    window?: unknown;
    DOMParser?: unknown;
    document?: unknown;
  };

  if (typeof g.window === "undefined") g.window = globalThis;
  if (!g.DOMParser) g.DOMParser = linkedomParser;
  const w = g.window as { DOMParser?: unknown };
  if (!w.DOMParser) w.DOMParser = linkedomParser;
  if (typeof g.document === "undefined") {
    g.document = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>").document;
  }

  installed = true;
}
