# web-clipper-headless

Headless renderer for Obsidian Web Clipper templates. Wraps `obsidian-clipper/api` with multi-provider LLM interpreter dispatch.

Spec lives in Nathan's vault: `Spec - Web clipper render library and vault_clip_url MCP tool`.

## Session start

Before replying substantively to the first message in any session, orient from:

1. The most recent entries in `docs/working-log.md` — what changed recently, what bugs were caught, what fixes are still pending.
2. Filenames in `docs/usage/` — scan, then read the most recent one or two in full if any are present.

Carry forward unresolved questions or thinking that's ahead of implementation rather than re-deriving them.

## Conventions

- Bun, TypeScript, strict mode.
- ABOUTME comment at the top of new files: prefix `// ABOUTME: ` only on the first line; continuation lines are plain `// ` comments.
- No `Co-Authored-By: Claude` trailer in commits.
- Sentence-case markdown headings.
- No comments unless the WHY is non-obvious.

## Setup

`bun install && bun run setup` — the second step builds upstream's `dist/api.mjs` (obsidian-clipper is consumed from GitHub, not npm). Tests: `bun test`.

## Durable lessons

Things worth remembering across sessions, learned the hard way.

- **Check upstream's actual implementation before tuning prompts or sanitizing model output.** Surface-level model quality issues (markdown leakage, padded values, formatting noise) often come from architectural choices, not prompt wording. We hit this with per-slot dispatch producing noisy values on Gemini Flash; the fix was switching to batched JSON dispatch like upstream does, not changing the prompt. Prompt tweaks would have been chasing the symptom.
- **defuddle wants a `Document`, not a `documentElement`.** Upstream's `clip()` does `doc.documentElement || doc`, which routes the wrong shape to defuddle in headless contexts using linkedom. Our build patch in `scripts/build-upstream.ts` fixes this; if defuddle output ever returns empty fields against valid HTML, check whether the patch applied. The marker `patched by web-clipper-headless` lives in `dist/api.mjs` as the idempotency signal.
- **The patcher must fail loud, never silent.** If upstream changes the line we patch and our string match misses, exit non-zero with an actionable message pointing at `scripts/build-upstream.ts`. A no-op silent fallback would let bad bundles ship.
