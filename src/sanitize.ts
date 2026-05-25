// ABOUTME: Filename hardening. The library produces the filename the MCP tool turns into
// suggested_path, which the caller writes to disk. This is the only gate that guarantees
// the path is safe to write — no invisible characters, no FS-reserved punctuation, no
// over-length names. Independent of upstream's clip() and the build-time patch.

// Stripped outright: ZWSP/ZWNJ/ZWJ/LRM/RLM (U+200B–U+200F), the bidi
// embedding/override block (U+202A–U+202E), WORD JOINER (U+2060), BOM (U+FEFF).
// Filenames have no legitimate reason to contain these. Body-content sanitation,
// if added later, must use a joiner-preserving denylist instead — ZWJ and ZWNJ
// are load-bearing in emoji sequences and several non-Latin scripts.
const INVISIBLE_RE = /[​-‏‪-‮⁠﻿]/g;

// Characters that are reserved or illegal across the common filesystems (NTFS, APFS,
// ext4) and Obsidian's wikilink resolver. Replaced with a hyphen so the rendered
// name still parses, instead of dropped which can collapse two distinct names.
const ILLEGAL_FS_RE = /[\/\\:*?"<>|]/g;

// 180 leaves comfortable headroom under common FS limits (255 bytes on most modern
// filesystems, accounting for multibyte UTF-8 expansion and Obsidian's `.md` suffix
// added by callers downstream).
const MAX_LENGTH = 180;

export function sanitizeNoteName(name: string): string {
  return name
    .replace(INVISIBLE_RE, "")
    .replace(ILLEGAL_FS_RE, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH);
}
