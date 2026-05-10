// ABOUTME: Pulls the NYT recipe URL and dumps its schema.org Recipe data so we can verify
// whether prepTime/cookTime fields are actually present on the page.

import { parseHTML } from "linkedom";
import { installPolyfills } from "../src/polyfills.ts";

installPolyfills();

const URL =
  "https://cooking.nytimes.com/recipes/1022068-skillet-chicken-with-mushrooms-and-caramelized-onions?unlocked_article_code=1.hVA.5_t5.Mr6gHKnxSUJS&smid=ck-recipe-iOS-share";

const html = await (await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
console.error("html length:", html.length);

console.error("\n=== JSON-LD blocks on the page ===");
const { document } = parseHTML(html);
const blocks = document.querySelectorAll('script[type="application/ld+json"]');
console.error("count:", blocks.length);
let i = 0;
for (const block of blocks) {
  i++;
  try {
    const text = block.textContent ?? "";
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const type = item["@type"];
      console.error(`\nBlock ${i} @type=${JSON.stringify(type)}`);
      if (Array.isArray(type) ? type.includes("Recipe") : type === "Recipe") {
        console.error("  prepTime:", item.prepTime);
        console.error("  cookTime:", item.cookTime);
        console.error("  totalTime:", item.totalTime);
        console.error("  recipeYield:", item.recipeYield);
        console.error("  recipeCuisine:", item.recipeCuisine);
        console.error("  aggregateRating:", item.aggregateRating);
      }
    }
  } catch (e) {
    console.error(`  Block ${i} parse error:`, e instanceof Error ? e.message : e);
  }
}

console.error("\n=== defuddle's schemaOrgData ===");
const { default: DefuddleClass } = await import("defuddle");
const result = new DefuddleClass(document as unknown as Document, { url: URL }).parse();
const schemas = Array.isArray(result.schemaOrgData) ? result.schemaOrgData : [result.schemaOrgData];
for (const s of schemas) {
  if (s && typeof s === "object") {
    const flat = Array.isArray(s) ? s : [s];
    for (const item of flat) {
      const t = (item as { "@type"?: unknown })["@type"];
      console.error(`@type=${JSON.stringify(t)}`);
      if (Array.isArray(t) ? t.includes("Recipe") : t === "Recipe") {
        console.error("  prepTime:", (item as Record<string, unknown>).prepTime);
        console.error("  cookTime:", (item as Record<string, unknown>).cookTime);
        console.error("  recipeYield:", (item as Record<string, unknown>).recipeYield);
      }
    }
  }
}
