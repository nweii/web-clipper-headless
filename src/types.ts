// ABOUTME: Public types for web-clipper-headless. The library wraps obsidian-clipper's headless API
// with LLM interpreter dispatch, multi-provider support, and a settings JSON loader.

export type ClipperTemplate = {
  schemaVersion: string;
  name: string;
  behavior: string;
  noteNameFormat: string;
  noteContentFormat: string;
  vault?: string;
  path?: string;
  context?: string;
  properties: TemplateProperty[];
  triggers?: string[];
};

export type TemplateProperty = {
  name: string;
  value: string;
  type: PropertyType;
};

export type PropertyType = "text" | "multitext" | "date" | "number" | "checkbox";

export type ClipperSettings = {
  templates: ClipperTemplate[];
  interpreterSettings?: {
    enabled: boolean;
    defaultModelId?: string;
    models: Array<{
      id: string;
      name: string;
      providerId: string;
      providerModelId: string;
      enabled: boolean;
    }>;
    providers: Array<{
      id: string;
      name: string;
      apiKey?: string;
      baseUrl?: string;
    }>;
  };
};

export type ProviderConfig = {
  provider: "anthropic" | "openai-compatible";
  baseUrl?: string;
  apiKey: string;
  model: string;
};

export type InterpreterSlot = {
  key: string;
  prompt: string;
  filterChain?: string;
  location: SlotLocation;
};

export type SlotLocation =
  | { kind: "noteName" }
  | { kind: "noteContent" }
  | { kind: "property"; propertyName: string };

export type PageContent = {
  source: "external_url";
  trusted: false;
  url: string;
  title?: string;
  body: string;
  schemaOrgData?: unknown;
  suspiciousPhrasesDetected?: string[];
};

export type PreparedState = {
  schemaVersion: 1;
  url: string;
  templateName: string;
  defuddleResult: unknown;
  slotMap: InterpreterSlot[];
  createdAt: number;
};

export type RenderOptions = {
  url: string;
  template: ClipperTemplate;
  providerConfig?: ProviderConfig;
  slotOverrides?: Record<string, string>;
  fetchHtml?: (url: string) => Promise<string>;
};

export type RenderedResult = {
  status: "rendered";
  filename: string;
  frontmatter: string;
  content: string;
  fullContent: string;
  resolvedSlots: Record<string, string>;
};

export type NeedsInterpretationResult = {
  status: "needs_interpretation";
  unresolvedSlots: InterpreterSlot[];
  pageContent: PageContent;
  preparedState: PreparedState;
};

export type RenderResult = RenderedResult | NeedsInterpretationResult;
