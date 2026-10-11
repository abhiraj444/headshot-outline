/** OpenAI-compatible chat-completions adapter (OpenAI, OpenRouter, Groq, Mistral, Together, xAI, Ollama, LM Studio, custom). */
import type { BuiltRequest, ProviderConfig, RequestContent } from "../types";
import { trimSlash } from "./util";

export function buildOpenAI(p: ProviderConfig, c: RequestContent): BuiltRequest {
  const userContent: unknown[] = [{ type: "text", text: c.reminder ? `${c.userText}\n\n${c.reminder}` : c.userText }];
  if (c.imageDataUrl) userContent.push({ type: "image_url", image_url: { url: c.imageDataUrl } });
  const body: Record<string, unknown> = {
    model: p.model,
    messages: [
      { role: "system", content: c.systemPrompt },
      { role: "user", content: c.imageDataUrl ? userContent : (userContent[0] as { text: string }).text },
    ],
  };
  const q = p.params;
  if (q.temperature !== undefined) body.temperature = q.temperature;
  if (q.max_tokens !== undefined) body.max_tokens = q.max_tokens;
  if (q.top_p !== undefined) body.top_p = q.top_p;
  if (q.top_k !== undefined) body.top_k = q.top_k;
  if (q.frequency_penalty !== undefined) body.frequency_penalty = q.frequency_penalty;
  if (q.presence_penalty !== undefined) body.presence_penalty = q.presence_penalty;
  if (q.seed !== undefined) body.seed = q.seed;
  if (q.stop && q.stop.length) body.stop = q.stop;
  if (q.json_mode) body.response_format = { type: "json_object" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
  return { url: `${trimSlash(p.baseUrl)}/chat/completions`, method: "POST", headers, body };
}

export function parseOpenAI(json: unknown): string {
  const j = json as { choices?: { message?: { content?: unknown } }[] };
  const content = j?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((x) => (typeof x === "string" ? x : (x as { text?: string })?.text ?? "")).join("");
  throw new Error("No message content in response");
}

export function modelsOpenAI(p: ProviderConfig): BuiltRequest {
  const headers: Record<string, string> = {};
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
  return { url: `${trimSlash(p.baseUrl)}/models`, method: "GET", headers, body: null };
}

export function parseModelsOpenAI(json: unknown): string[] {
  const j = json as { data?: { id: string }[]; models?: { name?: string; model?: string }[] };
  if (Array.isArray(j?.data)) return j.data.map((m) => m.id).filter(Boolean);
  if (Array.isArray(j?.models)) return j.models.map((m) => m.name ?? m.model ?? "").filter(Boolean);
  return [];
}
