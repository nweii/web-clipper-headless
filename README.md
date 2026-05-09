# web-clipper-headless

Headless renderer for [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) templates. Wraps the upstream `obsidian-clipper/api` module with a multi-provider LLM interpreter dispatch, settings JSON loader, and CLI.

> [!WARNING]
> Pre-alpha. Private development repo. APIs will change.

## Goal

Take a URL plus a Web Clipper template name, return a rendered Obsidian note. Headlessly. From any runtime: Node, Bun, Cloudflare Workers, Deno. Reuses the user's existing Web Clipper template format and provider configuration so there's no duplicate setup.

## Status

Phase 1 skeleton: types, settings loader, token walker, render pipeline (deterministic only — LLM dispatch not wired yet). Tests cover settings parsing and token walking. The defuddle/clip pipeline is plumbed but not yet validated end-to-end against a public article.

## Why "headless"

The official browser extension wins for any auth-walled or session-bound page (X threads, paywalled articles). This package is for the public web — running in webhooks, MCP servers, CLI, or any Node-compatible runtime. The browser extension is for clipping pages you're logged into; this is for everywhere else.

## Setup

Because `obsidian-clipper` is consumed from GitHub (not yet on npm), its headless API bundle has to be built once after install:

```bash
bun install
bun run setup       # builds obsidian-clipper's dist/api.mjs
bun test            # 17 passing
```

The `setup` script is opt-in rather than a postinstall hook so installing this package never silently runs upstream's build. Run it once after install, or whenever upstream is updated.

## Quick start

```ts
import { installPolyfills, render, loadSettings, findTemplate } from "web-clipper-headless";

installPolyfills();

const settings = await loadSettings("/path/to/web-clipper-settings.json");
const template = findTemplate(settings, "Full text");

const result = await render({
  url: "https://stephango.com/file-over-app",
  template,
});

if (result.status === "rendered") {
  console.log(result.fullContent);
}
```

The polyfill call is required outside the browser. It sets `globalThis.window`, `globalThis.DOMParser`, and `globalThis.document` from `linkedom` so defuddle's bundled Turndown initializes correctly. Safe to call multiple times.

## Architecture

See [the spec](https://github.com/nweii/web-clipper-headless/blob/main/docs/spec.md) (TODO: copy in) for the full design rationale, threat model, and provider-name mapping table.
