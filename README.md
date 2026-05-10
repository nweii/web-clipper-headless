# web-clipper-headless

Use [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) templates without a browser. Give it a URL, get back a rendered Obsidian note — from a CLI, a script, an MCP tool, a webhook, anywhere you can run JavaScript.

> [!WARNING]
> Pre-alpha. APIs will change.

## What it does

You already have Web Clipper templates set up in your browser. They define how a page becomes a note: which fields to extract, where to save it, what to ask an LLM to fill in. This package runs those same templates outside the browser, reading the same `web-clipper-settings.json` you already have.

That means you can:

- Clip a URL from the command line.
- Build an MCP tool that lets Claude clip pages into your vault.
- Run a webhook that turns a shared link into a note.
- Pre-process URLs in a script before they reach your vault.

Templates auto-match by URL trigger or `schema:@Type`, the same as the extension does. Pass an explicit template name to override.

The browser extension still wins for anything behind a login (X threads, paywalled articles, anything session-bound). This package reads the public HTML, so use it for the public web.

## Setup

```bash
bun install
bun run setup     # builds obsidian-clipper's headless bundle
bun test
```

`setup` is a separate step because obsidian-clipper isn't on npm; we build it from GitHub the first time.

## Quick start: CLI

```bash
# Auto-match by URL trigger
bunx wch https://news.example.com/article -s ~/clipper-settings.json --interpret

# Explicit template
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json --interpret

# Pre-fill specific interpreter slots
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json \
    --slot slot_0="durable note-taking"

# Write to a file
bunx wch https://example.com/article -t "Full text" -s ~/clipper-settings.json -o note.md
```

`bunx wch --help` for the full flag reference.

## Quick start: library

```ts
import { installPolyfills, renderFromSettings } from "web-clipper-headless";

installPolyfills();

const result = await renderFromSettings({
  url: "https://stephango.com/file-over-app",
  settingsPath: "/path/to/web-clipper-settings.json",
  templateName: "Full text",
  useInterpreter: true,
});

if (result.status === "rendered") {
  console.log(result.fullContent);
}
```

`installPolyfills()` is required outside the browser; it sets up `window`, `DOMParser`, and `document` from `linkedom`. Safe to call multiple times.

## Three ways to call render()

| You pass | You get |
|---|---|
| A template with no LLM slots, or all slots covered by `slotOverrides` | A rendered note |
| `providerConfig` set | A rendered note; the library calls the LLM for you |
| Neither | `{ status: "needs_interpretation", unresolvedSlots, pageContent }` — the caller fills slots and calls again |

The third shape is for when the caller is itself an LLM (Claude in claude.ai, an agent in Claude Code) and should fill slots directly rather than spinning up a second API call.

## Provider configuration

Providers are read from `interpreter_settings.providers[]` in your clipper settings JSON. Credential lookup:

1. Env var (per the table below) — wins if set.
2. `apiKey` from the JSON — used when the env var is unset and `credentialSource !== 'env'`.
3. Otherwise, an error listing which env vars were checked.

Env var names follow each provider's official SDK, so existing keys work as-is:

| Provider name (case-insensitive substring) | Env var |
|---|---|
| `anthropic`, `claude` | `ANTHROPIC_API_KEY` |
| `openai` (without "azure") | `OPENAI_API_KEY` |
| `azure` | `AZURE_OPENAI_API_KEY` |
| `google`, `gemini` | `GEMINI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `perplexity` | `PERPLEXITY_API_KEY` |
| `xai`, `grok` | `XAI_API_KEY` |
| `cohere` | `COHERE_API_KEY` |
| `huggingface`, `hugging face` | `HF_TOKEN` |
| `ollama` | (none — local) |

Unknown names fall back to `${UPPER_SNAKE(name)}_API_KEY`, so custom OpenAI-compatible endpoints work.

## Threat model

Two postures, depending on who's running the LLM.

**Server-side (the library calls the LLM).** Each interpreter call runs in isolation: no tools, no memory, no vault access. The system prompt marks page content as untrusted and wraps it in `<page>...</page>`. Page content is char-capped before send (default 64k chars, ~16k tokens); LLM output is char-capped per slot (1000 text, 500 multitext). Path, filename, and property names always come from the template, never from page content or model output.

**Caller-side (Claude in chat fills the slots).** The caller sees `pageContent` with explicit `trusted: false` and `source: "external_url"` markers, plus a `suspiciousPhrasesDetected` list. The presumption is human-in-the-loop, not an unsupervised agent.

A regex pass scans page content for prompt-injection markers (role overrides, boundary tokens, persona-shift phrases) and surfaces matches in the response. This is signal, not a gate — pages *about* prompt injection (writeups, tutorials, examples) still clip fine.

## Known limitations

- **JavaScript-rendered content is invisible.** Selectors run against the raw HTML; lazy-loaded sections and SPA routes won't be there. Failed selectors return empty strings.
- **Auth-walled pages won't work.** Public HTML only. Use the browser extension for anything behind a login.
- **Token caps may truncate LLM output** compared to the official extension. Configurable via `InterpreterOptions`.
- **The upstream bundle is patched on setup** to make defuddle linkedom-compatible and to expose `applyFilters`. If upstream drifts, `bun run setup` fails loudly rather than shipping a silently-broken bundle.

## Architecture

```
src/
├── render.ts              top-level render() — defuddle/clip + interpreter coordination
├── render-from-settings.ts  wrapper for the (settings path + template name) shape
├── tokens.ts              {{"prompt"|filters}} slot finder + substitution
├── interpreter.ts         LLM dispatch with untrusted-content framing + caps + filter chain
├── settings.ts            JSON loader (full settings vs single template, folder mode)
├── credentials.ts         env → JSON → error resolution
├── provider-mapping.ts    provider name → env var table
├── scan.ts                prompt-injection pattern detection
├── polyfills.ts           window/DOMParser/document via linkedom
├── providers/anthropic.ts
├── providers/openai-compatible.ts
└── types.ts

bin/cli.ts                 wch CLI
scripts/build-upstream.ts  builds + patches obsidian-clipper/dist/api.mjs
```

## License

MIT.
