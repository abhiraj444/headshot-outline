/**
 * Request builder: adapter body → custom headers → custom body JSON deep-merged LAST.
 * Pure (no network) so it powers both the live "Request preview" and the real call.
 */
import { deepMerge, isPlainObject } from "../core/params";
import { buildAnthropic, modelsAnthropic, parseAnthropic, parseModelsAnthropic } from "./adapters/anthropic";
import { buildGemini, modelsGemini, parseGemini, parseModelsGemini } from "./adapters/gemini";
import { buildOpenAI, modelsOpenAI, parseModelsOpenAI, parseOpenAI } from "./adapters/openai";
import type { BuiltRequest, ProviderConfig, RequestContent } from "./types";

export function parseCustomBody(text: string): { value: Record<string, unknown> | null; error: string | null } {
  const t = (text ?? "").trim();
  if (!t) return { value: null, error: null };
  try {
    const v = JSON.parse(t);
    if (!isPlainObject(v)) return { value: null, error: "Custom body must be a JSON object" };
    return { value: v, error: null };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

function applyCustomHeaders(req: BuiltRequest, p: ProviderConfig): BuiltRequest {
  const headers = { ...req.headers };
  for (const { key, value } of p.headers ?? []) {
    const k = key.trim();
    if (k) headers[k] = value;
  }
  return { ...req, headers };
}

export function buildRequest(p: ProviderConfig, c: RequestContent): BuiltRequest {
  let req: BuiltRequest;
  if (p.format === "gemini") req = buildGemini(p, c);
  else if (p.format === "anthropic") req = buildAnthropic(p, c);
  else req = buildOpenAI(p, c);
  req = applyCustomHeaders(req, p);
  const custom = parseCustomBody(p.customBody).value;
  if (custom && req.body) req = { ...req, body: deepMerge(req.body, custom) };
  return req;
}

export function buildModelsRequest(p: ProviderConfig): BuiltRequest {
  const base = p.format === "gemini" ? modelsGemini(p) : p.format === "anthropic" ? modelsAnthropic(p) : modelsOpenAI(p);
  return applyCustomHeaders(base, p);
}

export function parseModels(p: ProviderConfig, json: unknown): string[] {
  const list = p.format === "gemini" ? parseModelsGemini(json) : p.format === "anthropic" ? parseModelsAnthropic(json) : parseModelsOpenAI(json);
  return Array.from(new Set(list)).sort();
}

export function parseResponseText(p: ProviderConfig, json: unknown, req: BuiltRequest): string {
  if (p.format === "gemini") return parseGemini(json);
  if (p.format === "anthropic") {
    const msgs = (req.body?.messages as { role: string; content: unknown }[] | undefined) ?? [];
    const prefilled = msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && msgs[msgs.length - 1].content === "{";
    return parseAnthropic(json, prefilled);
  }
  return parseOpenAI(json);
}

const SECRET_HEADERS = ["authorization", "x-api-key", "x-goog-api-key", "api-key"];

/** Copy of the request safe to show: key redacted, image data truncated. */
export function redactRequest(req: BuiltRequest, apiKey: string): BuiltRequest {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const secret = SECRET_HEADERS.includes(k.toLowerCase()) || (apiKey && v.includes(apiKey));
    headers[k] = secret && apiKey ? v.split(apiKey).join(`${apiKey.slice(0, 3)}…[redacted]`) : v;
  }
  const truncate = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v.startsWith("data:image")) return `${v.slice(0, 40)}…(${v.length} chars)`;
      if (v.length > 400 && /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 200))) return `${v.slice(0, 24)}…(${v.length} base64 chars)`;
      if (apiKey && v.includes(apiKey)) return v.replace(apiKey, "[redacted]");
      return v;
    }
    if (Array.isArray(v)) return v.map(truncate);
    if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, truncate(x)]));
    return v;
  };
  const url = apiKey ? req.url.replace(apiKey, "[redacted]") : req.url;
  return { ...req, url, headers, body: req.body ? (truncate(req.body) as Record<string, unknown>) : null };
}
