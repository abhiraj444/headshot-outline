export type ApiFormat = "openai" | "gemini" | "anthropic";

/** Optional per-provider request parameters. `undefined` = not sent. */
export interface ProviderParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  stop?: string[];
  json_mode?: boolean;
  /** request timeout (ms) */
  timeout_ms?: number;
  /** retries on 429/timeout before moving to the next provider */
  retries?: number;
  /** backoff before a retry (ms) */
  backoff_ms?: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  preset: string;
  format: ApiFormat;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  params: ProviderParams;
  /** raw JSON text deep-merged into the body LAST */
  customBody: string;
  headers: { key: string; value: string }[];
  systemPrompt: string;
  imageMaxWidth: number;
  jpegQuality: number;
}

export interface BuiltRequest {
  url: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

export interface RequestContent {
  systemPrompt: string;
  userText: string;
  /** data URL (image/jpeg) — optional for text-only (connection test) */
  imageDataUrl?: string;
  /** extra stricter reminder appended for the malformed-output retry */
  reminder?: string;
}

export type CriticErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "not_found"
  | "cors_or_network"
  | "bad_request"
  | "server"
  | "malformed"
  | "config"
  | "unknown";

export class CriticError extends Error {
  constructor(public kind: CriticErrorKind, message: string, public status?: number, public provider?: string) {
    super(message);
    this.name = "CriticError";
  }
}
