/** Anthropic Messages API adapter (direct browser access header enabled). */
import type { BuiltRequest, ProviderConfig, RequestContent } from "../types";
import { splitDataUrl, trimSlash } from "./util";

export const ANTHROPIC_VERSION = "2023-06-01";
/** max_tokens is required by the Messages API; used only when the user leaves it unset. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 1024;

export function anthropicHeaders(p: ProviderConfig): Record<string, string> {
  const h: Record<string, string> = {
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (p.apiKey) h["x-api-key"] = p.apiKey;
  return h;
}

export function buildAnthropic(p: ProviderConfig, c: RequestContent): BuiltRequest {
  const content: unknown[] = [];
  if (c.imageDataUrl) {
    const { mime, data } = splitDataUrl(c.imageDataUrl);
    content.push({ type: "image", source: { type: "base64", media_type: mime, data } });
  }
  content.push({ type: "text", text: c.reminder ? `${c.userText}\n\n${c.reminder}` : c.userText });
  const messages: unknown[] = [{ role: "user", content }];
  const q = p.params;
  // JSON mode: Anthropic has no response_format; prefill the assistant turn with "{".
  if (q.json_mode) messages.push({ role: "assistant", content: "{" });
  const body: Record<string, unknown> = {
    model: p.model,
    max_tokens: q.max_tokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    system: c.systemPrompt,
    messages,
  };
  if (q.temperature !== undefined) body.temperature = q.temperature;
  if (q.top_p !== undefined) body.top_p = q.top_p;
  if (q.top_k !== undefined) body.top_k = q.top_k;
  if (q.stop && q.stop.length) body.stop_sequences = q.stop;
  return {
    url: `${trimSlash(p.baseUrl)}/messages`,
    method: "POST",
    headers: { "Content-Type": "application/json", ...anthropicHeaders(p) },
    body,
  };
}

export function parseAnthropic(json: unknown, prefilled: boolean): string {
  const j = json as { content?: { type: string; text?: string }[] };
  if (!Array.isArray(j?.content)) throw new Error("No content in response");
  const text = j.content.filter((x) => x.type === "text").map((x) => x.text ?? "").join("");
  return prefilled ? `{${text}` : text;
}

export function modelsAnthropic(p: ProviderConfig): BuiltRequest {
  return { url: `${trimSlash(p.baseUrl)}/models?limit=100`, method: "GET", headers: anthropicHeaders(p), body: null };
}

export function parseModelsAnthropic(json: unknown): string[] {
  const j = json as { data?: { id: string }[] };
  return (j?.data ?? []).map((m) => m.id);
}
