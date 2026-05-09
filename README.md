# web-clipper-headless

Headless renderer for [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) templates. Wraps the upstream `obsidian-clipper/api` module with a multi-provider LLM interpreter dispatch, settings JSON loader, and CLI.

> [!WARNING]
> Pre-alpha. Private development repo. APIs will change.

## What this is

Take a URL plus a Web Clipper template name, return a rendered Obsidian note. Headlessly. From any runtime: Node, Bun, Cloudflare Workers, Deno. Reuses the user's existing Web Clipper template format and provider configuration so there's no duplicate setup.

The official browser extension wins for any auth-walled or session-bound page (X threads, paywalled articles, anything behind a login). This package is for the public web — webhooks, MCP servers, CLI, any Node-compatible runtime.

## Setup

`obsidian-clipper` is consumed from GitHub (not yet on npm), so its headless API bundle has to be built once after install:

```bash
bun install
bun run setup       # builds + patches obsidian-clipper's dist/api.mjs
bun test            # all tests pass
```

The `setup` step is opt-in rather than a postinstall hook so installing this package never silently runs upstream's build. It also applies a small linkedom-compatibility patch to the upstream bundle (see `scripts/build-upstream.ts` for details).

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

The polyfill call is required outside the browser. It sets `globalThis.window`, `globalThis.DOMParser`, and `globalThis.document` from `linkedom` so defuddle's bundled Turndown initializes correctly. Safe to call multiple times.

## Quick start: CLI

```bash
# Deterministic clip (no LLM): only static template variables resolve, interpreter slots stay empty
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

The library is one function, three call shapes — picked by what you pass:

| Shape | What you pass | What you get |
|---|---|---|
| **Deterministic** | template with no interpreter slots, OR all slots covered by `slotOverrides` | `{ status: "rendered", filename, fullContent, ... }` |
| **Headless w/ LLM** | `providerConfig` set; library dispatches LLM calls server-side | `{ status: "rendered", ..., resolvedSlots }` |
| **Chat-driven** | no `providerConfig`, no full overrides | `{ status: "needs_interpretation", unresolvedSlots, pageContent, preparedState }` — caller fills slots, calls again with `slotOverrides` |

The third shape is for environments where the calling agent is already an LLM (Claude in claude.ai, Claude Code) and should fill the interpreter slots itself rather than having the library make a separate API call.

## Provider configuration

The library reads providers from your clipper settings JSON's `interpreter_settings.providers[]`. Credential resolution chain:

1. **Env var** (matched by provider name, see table below) — wins if set
2. **`apiKey` from clipper JSON** — used if env var is unset and `credentialSource !== 'env'`
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

Two paths, two postures.

### Server-side LLM (headless, webhook)

Each interpreter call runs in an isolated context: no tools, no memory of the outer task, no vault access. The system prompt declares page content untrusted and wraps it in `<page>...</page>` tags. Output is length-capped before substitution. Path, filename, and property names always come from the template, never from page content or LLM output.

Page content is char-capped (default 64k chars input, ~16k tokens) before sending to the LLM. LLM output is char-capped per slot (1000 for text, 500 for multitext). Both configurable via `InterpreterOptions`.

### Pattern detection (soft signal)

Before LLM dispatch, a small regex pass scans the page content for common prompt-injection markers (role overrides, boundary tokens, instruction-override phrases, persona-shift attempts). Matches are recorded and surfaced in the response.

This is **not** a security boundary — the no-tools isolation is. Pattern detection is signal, not gate. It does not refuse to clip pages *about* prompt injection: security writeups, tutorials, and articles that quote injection examples are all legitimate.

### Chat-session LLM

In the third call shape, the caller's LLM (Claude in chat) sees page content directly and fills interpreter slots itself. The caller is presumed to be a human-in-the-loop session, not an unsupervised agent. The `pageContent` field is structured with explicit `trusted: false` and `source: "external_url"` markers; `suspiciousPhrasesDetected` lists any pattern matches.

## Known limitations

- **CSS-selector variables degrade silently** against JavaScript-rendered content. Selectors work fine on static HTML via linkedom, but cannot see content rendered after page load (lazy-loaded sections, SPA routes, content injected client-side). Failed selectors return empty strings.
- **Polyfills required outside the browser.** `installPolyfills()` is the canonical setup; the library expects it to have been called.
- **Auth-walled pages won't work.** `defuddle` runs against the public HTML; X threads, paywalled articles, anything requiring a session will fail to extract. This is by design; use the official browser extension for those.
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
├── credentials.ts         env → JSON → error resolution chain
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
