// ABOUTME: Sentinel-source recognition. Some URLs render a JS-only shell whose <title>
// is a generic "JavaScript is not available" notice (e.g. X / Twitter). Defuddle has
// nothing real to extract from these pages, so the only correct behaviour is to refuse
// to render and tell the caller exactly which variableOverrides to supply.
//
// This is the Option-B core from the lifecycle spec: recognize the failure, name what
// the caller has to provide, throw a structured error. The library does not fetch the
// real content itself — that stays in the caller's context, where the cost and trust
// boundary already live.

export type RequiredOverride = "title" | "content";

export type Sentinel = {
  pattern: RegExp;
  sourceLabel: string;
  requiredOverrides: ReadonlyArray<RequiredOverride>;
  hint?: string;
};

// Add new entries as more JS-shell sources surface. Each pattern matches against
// the trimmed <title> text — exact-match phrasing reduces false positives against
// articles that mention the phrase mid-sentence.
const SENTINELS: ReadonlyArray<Sentinel> = [
  {
    pattern: /^JavaScript is not available\.?$/,
    sourceLabel: "X / Twitter (JS shell)",
    requiredOverrides: ["title", "content"],
    hint:
      "X URLs render a JS-only shell; defuddle can't see the real title or body. " +
      "Fetch the thread externally (e.g. via a tweet API) and retry with " +
      "variableOverrides.title and variableOverrides.content.",
  },
];

export function detectSentinel(title: string | undefined | null): Sentinel | null {
  if (!title) return null;
  const trimmed = title.trim();
  if (trimmed.length === 0) return null;
  for (const sentinel of SENTINELS) {
    if (sentinel.pattern.test(trimmed)) return sentinel;
  }
  return null;
}

export class SourceNeedsOverridesError extends Error {
  readonly url: string;
  readonly sourceLabel: string;
  readonly detectedSentinel: string;
  readonly requiredOverrides: ReadonlyArray<RequiredOverride>;
  readonly missingOverrides: ReadonlyArray<RequiredOverride>;

  constructor(opts: {
    url: string;
    sourceLabel: string;
    detectedSentinel: string;
    requiredOverrides: ReadonlyArray<RequiredOverride>;
    missingOverrides: ReadonlyArray<RequiredOverride>;
    hint?: string;
  }) {
    const missing = opts.missingOverrides.join(", ");
    const tail = opts.hint ? ` ${opts.hint}` : "";
    super(
      `${opts.sourceLabel}: defuddle returned a sentinel title ("${opts.detectedSentinel}") for ${opts.url}. ` +
        `Provide variableOverrides for: ${missing}.${tail}`
    );
    this.name = "SourceNeedsOverridesError";
    this.url = opts.url;
    this.sourceLabel = opts.sourceLabel;
    this.detectedSentinel = opts.detectedSentinel;
    this.requiredOverrides = opts.requiredOverrides;
    this.missingOverrides = opts.missingOverrides;
  }
}
