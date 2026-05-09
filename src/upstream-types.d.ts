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
  export function matchTemplate(
    templates: unknown[],
    url: string,
    schemaOrgData?: unknown
  ): unknown;
  // Exposed by web-clipper-headless's build patcher (see scripts/build-upstream.ts).
  export function applyFilters(
    value: string,
    filterString: string,
    currentUrl?: string
  ): string;
}
