# web-clipper-headless

Use your [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) templates from outside the browser, anywhere JavaScript runs.

Point it at a URL and your existing `web-clipper-settings.json`; it returns the rendered note as a markdown string.

This is a personal tool I open-sourced in case it's useful to others.

## Features

For clipping work that happens outside a browser: webhook workflows, MCP tools, cron jobs, and agents that clip into a vault on their own.

- Picks the right template the same way the browser extension does (URL prefix, regex, or `schema:@Type` triggers), or by explicit name.
- Reuses your existing `web-clipper-settings.json` so templates, providers, and prompts stay in one place.
- Three call shapes for how interpreter slots get filled: deterministic, server-side LLM, or chat-driven (the calling agent fills slots itself).
- Works with the major LLM providers: Anthropic, any OpenAI-compatible endpoint (OpenAI, Gemini, OpenRouter, DeepSeek, Groq, Mistral, Perplexity, Grok, Ollama, custom), and Cohere. API keys come from your settings JSON or env vars.
- `variableOverrides` accepts caller-supplied content when defuddle can't see the page on its own (JS-rendered SPAs, authenticated sources, JS shells like X). See [External fetchers](#external-fetchers).
- Refuses to render known JS-shell sources (like X) until you provide the missing values, throwing a `SourceNeedsOverridesError` that lists what's needed so callers can catch and retry.
- Filename sanitization keeps invisible and FS-illegal characters from reaching disk.
- Slot filter chains (`wikilink`, `split`, and so on) apply to both LLM output and caller-supplied overrides, so an overridden value renders the same shape as an interpreted one.
- CLI (`wch`) for ad-hoc clips from the terminal.

## What you need

- **Node 20+ or Bun** to run it. Library code is TypeScript with no platform-specific dependencies.
- **An existing `web-clipper-settings.json`** — export it from the Web Clipper extension's settings, or hand-write one in the same format.
- **API keys** for whichever LLM providers your templates use, if any of them have interpreter slots. Either from the exported settings JSON (which carries them by default) or from environment variables — env wins when both are present. See [Provider configuration](#provider-configuration) for the full resolution chain and per-provider env var names.

Your vault does not need to live on the same machine. This library returns the rendered note as a string; writing it to disk, sending it through an MCP tool, or POSTing it somewhere is the caller's job. The only file the library reads from disk is the settings JSON.

## When to use this (and when not to)

Reach for this when clipping needs to happen server-side: webhook workflows, MCP tools, cron jobs, agents that clip into a vault on their own. Also for chat-driven cases where the LLM in the loop fills interpreter slots itself rather than the library making its own call.

For pages that need a logged-in session (X threads, paywalled articles, logged-in dashboards), either keep the browser extension for those clips or pair this library with your own fetcher and pass the result through `variableOverrides`. The library has no cookies and no session of its own. See [External fetchers](#external-fetchers).

## Setup

`obsidian-clipper` ships from GitHub rather than npm, so we build its bundle once after install:

```bash
bun install
bun run setup       # builds + patches obsidian-clipper's dist/api.mjs
bun test
```

Setup is a separate step rather than a postinstall hook so installing this package never silently runs upstream's build. The step also applies a small linkedom-compatibility patch to the upstream bundle (see `scripts/build-upstream.ts`).

## Quick start: library

```ts
import {
  installPolyfills,
  renderFromSettings,
} from "web-clipper-headless";

installPolyfills();

const result = await renderFromSettings({
  url: "https://stephango.com/file-over-app",
  settingsPath: "/path/to/web-clipper-settings.json",
  templateName: "Full text",
  useInterpreter: true,    // run LLM server-side; or pre-fill via slotOverrides
});

if (result.status === "rendered") {
  console.log(result.fullContent);
}
```

`installPolyfills()` is required outside the browser. It gives defuddle the DOM globals it needs (`window`, `DOMParser`, `document`) so HTML parsing works in Node and Bun. Safe to call multiple times.

## Quick start: CLI

```bash
# Auto-match by trigger (no -t flag); picks the right template based on URL or schema
bunx wch https://news.example.com/article -s ~/clipper-settings.json --interpret

# Explicit template (always overrides auto-match)
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json

# With server-side interpreter
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json --interpret

# Pre-fill specific interpreter slots (useful for chat-driven flows)
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json \
    --slot slot_0="durable note-taking"

# Write to file instead of stdout
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json -o note.md
```

`bunx wch --help` for the full flag reference.

## Three call patterns

A Web Clipper template has two kinds of tokens the library fills in:

- **Variables** — `{{title}}`, `{{content}}`, `{{author}}`, and so on. Defuddle extracts these from the page HTML. You can override any of them via `variableOverrides` (see [External fetchers](#external-fetchers)).
- **Interpreter slots** — `{{"some prompt"}}`, a prompt in double quotes. An LLM generates the value at render time. You can pre-fill any of them via `slotOverrides`, or let the library make the LLM call.

The `render()` call behaves three ways depending on what the template uses and what you pass:

| Shape | What you pass | What you get |
|---|---|---|
| **Deterministic** | A template with no interpreter slots, or `slotOverrides` covering every slot. No LLM call happens. | The rendered note (`status: "rendered"`). |
| **Headless w/ LLM** | A template with interpreter slots, plus `providerConfig` (provider name, model, API key). The library makes the LLM call for you. | The rendered note, with slot values resolved by the LLM. `resolvedSlots` returns what the LLM produced. |
| **Chat-driven** | A template with interpreter slots, no `providerConfig`. The library fetches the page, runs defuddle, and returns the unfilled slot prompts plus the extracted page content. | A `needs_interpretation` response with `unresolvedSlots`, `pageContent`, and `preparedState`. You fill the slots (in chat, by hand, however), then call `render()` again with `slotOverrides`. |

The third shape is for environments where the calling agent is already an LLM (Claude in claude.ai, Claude Code) and should fill the interpreter slots itself rather than having the library make a separate API call.

## External fetchers

For pages defuddle can't read on its own (JS-rendered SPAs, auth-walled sources, JS shells like X), fetch the body with your own mechanism and pass the result through `variableOverrides`:

```ts
const result = await renderFromSettings({
  url: "https://x.com/user/status/1234",
  settingsPath: "...",
  templateName: "X thread",
  variableOverrides: {
    title:   "Real thread title",
    content: "Real thread body, as markdown",
    author:  "Real author handle",
  },
});
```

Overrides are flat, keyed by bare variable name (`title`, `content`, `author`, and so on). Defuddle still runs on the fetched HTML for everything *not* overridden, and template trigger matching is unaffected, so you can mix caller-supplied values with what defuddle finds for the same clip.

For sources the library knows it can't read (currently the X / Twitter JS shell), `render()` throws `SourceNeedsOverridesError` listing which overrides are required. Catch the error and retry with the missing values. See `src/sources.ts` for the registry and how to extend it.

## Provider configuration

The library reads providers from your clipper settings JSON's `interpreter_settings.providers[]`. How it finds your API key:

1. **Env var** (matched by provider name, see table below) — wins if set
2. **`apiKey` from clipper JSON** — used if no env var matches
3. **Error** — actionable, lists which env vars were checked

### Provider name → env var mapping

Conventions follow each provider's official SDK so existing keys work without renaming:

| Clipper `providers[].name` (case-insensitive substring) | Env var | Adapter |
|---|---|---|
| `anthropic`, `claude` | `ANTHROPIC_API_KEY` | anthropic native |
| `openai` (without "azure") | `OPENAI_API_KEY` | openai-compatible |
| `azure` | `AZURE_OPENAI_API_KEY` | openai-compatible |
| `google`, `gemini` | `GEMINI_API_KEY` | openai-compatible |
| `openrouter` | `OPENROUTER_API_KEY` | openai-compatible |
| `deepseek` | `DEEPSEEK_API_KEY` | openai-compatible |
| `groq` | `GROQ_API_KEY` | openai-compatible |
| `mistral` | `MISTRAL_API_KEY` | openai-compatible |
| `perplexity` | `PERPLEXITY_API_KEY` | openai-compatible |
| `xai`, `grok` | `XAI_API_KEY` | openai-compatible |
| `cohere` | `COHERE_API_KEY` | cohere |
| `huggingface`, `hugging face` | `HF_TOKEN` | openai-compatible |
| `ollama` | (none — local) | openai-compatible |

Unknown provider names fall back to `${UPPER_SNAKE(name)}_API_KEY`. Useful for custom OpenAI-compatible endpoints.

## Threat model

### Server-side LLM (headless, webhook)

Each interpreter call runs without tools, vault access, or memory of the outer task. The system prompt declares page content untrusted and wraps it in `<page>...</page>` tags. LLM output is capped at a character limit before it goes into the template. Path, filename, and property names always come from the template, never from page content or LLM output.

Page content is trimmed to 64k characters (~16k tokens) before going to the LLM. LLM output is trimmed per slot: 1000 chars for text slots, 500 for multitext. Both limits configurable via `InterpreterOptions`.

### Pattern detection (soft signal)

Before sending page content to the LLM, a small regex pass scans it for common prompt-injection markers (role overrides, boundary tokens, instruction-override phrases, persona-shift attempts). Matches are recorded and surfaced in the response.

Pattern detection is informational only. The no-tools isolation above is the actual security boundary; matches are surfaced in the response so callers can decide what to do with them. The scanner does not refuse to clip pages *about* prompt injection: security writeups, tutorials, and articles that quote injection examples are all legitimate.

### Chat-session LLM

In the third call shape, the caller's LLM (Claude in chat) sees page content directly and fills interpreter slots itself. The caller is presumed to be a human-in-the-loop session, not an unsupervised agent. The `pageContent` field includes `trusted: false` and `source: "external_url"` so the caller's LLM can see the content isn't trustworthy; `suspiciousPhrasesDetected` lists any pattern matches.

## Known limitations

- **CSS-selector variables degrade silently** against JavaScript-rendered content. Selectors work fine on static HTML via linkedom, but cannot see content rendered after page load (lazy-loaded sections, SPA routes, content injected client-side). Failed selectors return empty strings.
- **Polyfills required outside the browser.** Call `installPolyfills()` once at startup; the library expects it to have been called before `render()`.
- **Auth-walled and JS-rendered pages need an external fetcher.** `defuddle` runs against public HTML, so X threads, paywalled articles, and most SPAs won't extract on their own. The library accepts a caller-supplied body via `variableOverrides`; see [External fetchers](#external-fetchers).
- **Token caps may shorten LLM output** vs the official extension. Per-template configuration available via `InterpreterOptions`.
- **Upstream bundle patching** — `bun run setup` patches `node_modules/obsidian-clipper/dist/api.mjs` to make defuddle linkedom-compatible and to expose `applyFilters`. The patcher exits with an error if upstream's bundle drifts so the patch can't apply.

## Architecture

```
src/
├── render.ts              top-level render() — defuddle/clip dispatch + interpreter coordination
├── render-from-settings.ts  convenience wrapper for the (settings path + template name) input shape
├── tokens.ts              {{"prompt"|filters}} slot finder + literal substitution
├── interpreter.ts         per-slot LLM dispatch with untrusted-content framing + caps + filter chain
├── settings.ts            JSON loader: full-settings vs single-template detection, folder mode
├── credentials.ts         API key lookup: env → settings JSON → error
├── provider-mapping.ts    clipper provider name → env var convention table
├── scan.ts                regex pattern detection (soft signal, not a boundary)
├── polyfills.ts           globalThis.window/DOMParser/document via linkedom
├── providers/anthropic.ts
├── providers/openai-compatible.ts
└── types.ts

bin/cli.ts                 wch CLI
scripts/build-upstream.ts  builds + patches obsidian-clipper/dist/api.mjs
```

## License

MIT.
