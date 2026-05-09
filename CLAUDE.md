# web-clipper-headless

Headless renderer for Obsidian Web Clipper templates. Wraps `obsidian-clipper/api` with multi-provider LLM interpreter dispatch.

Spec lives in Nathan's vault: `Spec - Web clipper render library and vault_clip_url MCP tool`.

## Session start

Before replying substantively to the first message in any session, orient from:

1. The most recent entries in `project-chronicles/working-log.md` — what changed recently, what bugs were caught, what fixes are still pending.
2. Filenames in `project-chronicles/usage/` — scan, then read the most recent one or two in full if any are present.

Carry forward unresolved questions or thinking that's ahead of implementation rather than re-deriving them.

## Conventions

- Bun, TypeScript, strict mode.
- ABOUTME comments at the top of new files (1-2 lines, prefixed `// ABOUTME: `).
- No `Co-Authored-By: Claude` trailer in commits.
- Sentence-case markdown headings.
- No comments unless the WHY is non-obvious.

## Setup

`bun install && bun run setup` — the second step builds upstream's `dist/api.mjs` (obsidian-clipper is consumed from GitHub, not npm). Tests: `bun test`.
