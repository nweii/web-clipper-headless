// ABOUTME: End-to-end smoke test of render() with the documentElement proxy fix.

import { render } from "../src/index.ts";
import type { ClipperTemplate } from "../src/types.ts";

const template: ClipperTemplate = {
  schemaVersion: "0.1.0",
  name: "Smoke",
  behavior: "create",
  noteNameFormat: "{{title}} - {{site}}",
  noteContentFormat: "{{content}}",
  path: "Clippings",
  properties: [
    { name: "title", value: "{{title}}", type: "text" },
    { name: "url", value: '{{url|split:"?"|slice:0,1}}', type: "text" },
    { name: "author", value: "{{author}}", type: "text" },
    { name: "site", value: "{{site}}", type: "text" },
    { name: "static", value: "literal", type: "text" },
  ],
  triggers: [],
};

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Pragmatic Note Taker</title>
  <meta name="author" content="Sam Example">
  <meta property="og:site_name" content="Example Press">
</head>
<body>
  <article>
    <h1>Pragmatic Note Taker</h1>
    <p>Note-taking systems fail when their owners optimize for the system instead of the work.</p>
    <p>The simplest durable system is also the oldest: dated notes, plain text, links between things you actually re-encountered.</p>
    <p>What kills note-taking systems is not lack of features. It is the ongoing tax of maintenance.</p>
    <p>Practical heuristics: avoid one-off categories; prefer atomic notes; link liberally but only when re-encountered.</p>
  </article>
</body>
</html>`;

console.error("=== render() against fixture HTML ===\n");
const fixtureResult = await render({
  url: "https://example.com/test?utm=foo",
  template,
  fetchHtml: async () => FIXTURE_HTML,
});
if (fixtureResult.status === "rendered") {
  console.error("filename:", fixtureResult.filename);
  console.error("\nfullContent:\n" + fixtureResult.fullContent);
} else {
  console.error("unexpected status:", fixtureResult.status);
}

console.error("\n\n=== render() against live URL ===\n");
const liveResult = await render({
  url: "https://stephango.com/file-over-app",
  template,
});
if (liveResult.status === "rendered") {
  console.error("filename:", liveResult.filename);
  console.error("\nfullContent (first 800 chars):\n" + liveResult.fullContent.slice(0, 800));
} else {
  console.error("unexpected status:", liveResult.status);
}
