// ABOUTME: Verify applyFilters is now accessible via the patched bundle.

import { installPolyfills } from "../src/polyfills.ts";
installPolyfills();

const mod = await import("obsidian-clipper/api");
const apply = (mod as unknown as { applyFilters: (v: string, c: string, u?: string) => string }).applyFilters;

console.error("applyFilters:", typeof apply);
console.error("split/slice/join:", apply("alpha,beta,gamma", 'split:","|slice:0,2|join:", "', "https://example.com"));
console.error("wikilink:", apply("Sam Example", "wikilink", "https://example.com"));
console.error("safe_name:", apply("Title with: bad chars / and?", "safe_name", "https://example.com"));
