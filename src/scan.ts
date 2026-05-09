// ABOUTME: Lightweight regex pattern detection for common prompt-injection markers.
// Visibility/quarantine signal, NOT a security boundary. The no-tools isolation
// in interpreter dispatch is the load-bearing defense.

export type SuspiciousMatch = {
  pattern: string;
  sample: string;
};

export type ScanResult = {
  matches: SuspiciousMatch[];
  riskScore: number;
};

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "ignore-previous-instructions", regex: /ignore\s+(previous|prior|all|above)\s+instructions/i },
  { name: "disregard-prior", regex: /(disregard|forget)\s+(previous|prior|all|above)/i },
  { name: "role-override-line-start", regex: /^\s*(system|assistant|user|human)\s*:/im },
  { name: "system-tag", regex: /<\/?\s*(system|im_start|im_end)\s*>/i },
  { name: "inst-tag", regex: /\[\/?INST\]/ },
  { name: "your-real-task", regex: /your\s+(real|actual|true|new)\s+(task|goal|purpose|instructions|role)/i },
  { name: "respond-with-only", regex: /respond\s+(only\s+)?with\s+the\s+following/i },
  { name: "you-are-now", regex: /you\s+are\s+now\s+(a\s+|an\s+)?[a-z]+/i },
  { name: "pretend-to-be", regex: /pretend\s+(you\s+are|to\s+be)/i },
  { name: "im-token", regex: /<\|im_(start|end)\|>/i },
  { name: "act-as", regex: /\bact\s+as\s+(if|though)\b/i },
  { name: "from-now-on-you", regex: /from\s+now\s+on,?\s+you/i },
];

export function scanForInjection(content: string, opts: { maxSampleChars?: number } = {}): ScanResult {
  const maxSample = opts.maxSampleChars ?? 80;
  const matches: SuspiciousMatch[] = [];

  for (const { name, regex } of PATTERNS) {
    const m = content.match(regex);
    if (m) {
      const sample = m[0]?.slice(0, maxSample) ?? "";
      matches.push({ pattern: name, sample });
    }
  }

  return {
    matches,
    riskScore: matches.length,
  };
}
