// ABOUTME: Minimal type declarations for the upstream obsidian-clipper/api module
// since the upstream package does not ship its own type declarations.

declare module "obsidian-clipper/api" {
  export interface DocumentParser {
    parseFromString(html: string, mimeType?: string): unknown;
  }

  export interface ClipOptions {
    html: string;
    url: string;
    template: unknown;
    documentParser: DocumentParser;
    propertyTypes?: Record<string, string>;
    parsedDocument?: unknown;
    // Exposed by web-clipper-headless's build patcher (see scripts/build-upstream.ts).
    // Caller-supplied values patch onto the variables dict after defuddle extraction,
    // before template compilation. Keys are bare variable names (e.g. "content", "title").
    variableOverrides?: Record<string, string>;
  }

  export interface ClipResult {
    noteName: string;
    frontmatter: string;
    content: string;
    fullContent: string;
    properties: Array<{ name: string; value: string; type?: string }>;
    variables: Record<string, string>;
  }

  export function clip(options: ClipOptions): Promise<ClipResult>;
  export function matchTemplate<T = unknown>(
    templates: T[],
    url: string,
    schemaOrgData?: unknown
  ): T | undefined;
  // Exposed by web-clipper-headless's build patcher (see scripts/build-upstream.ts).
  export function applyFilters(
    value: string,
    filterString: string,
    currentUrl?: string
  ): string;
}
