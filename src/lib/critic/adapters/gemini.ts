/** Google Gemini generateContent adapter (JSON response mode via responseMimeType). */
import type { BuiltRequest, ProviderConfig, RequestContent } from "../types";
import { splitDataUrl, trimSlash } from "./util";

export function buildGemini(p: ProviderConfig, c: RequestContent): BuiltRequest {
  const parts: unknown[] = [{ text: c.reminder ? `${c.userText}\n\n${c.reminder}` : c.userText }];
  if (c.imageDataUrl) {
    const { mime, data } = splitDataUrl(c.imageDataUrl);
    parts.push({ inline_data: { mime_type: mime, data } });
  }
  const gen: Record<string, unknown> = {};
  const q = p.params;
  if (q.temperature !== undefined) gen.temperature = q.temperature;
  if (q.max_tokens !== undefined) gen.maxOutputTokens = q.max_tokens;
  if (q.top_p !== undefined) gen.topP = q.top_p;
  if (q.top_k !== undefined) gen.topK = q.top_k;
  if (q.frequency_penalty !== undefined) gen.frequencyPenalty = q.frequency_penalty;
  if (q.presence_penalty !== undefined) gen.presencePenalty = q.presence_penalty;
  if (q.seed !== undefined) gen.seed = q.seed;
  if (q.stop && q.stop.length) gen.stopSequences = q.stop;
  if (q.json_mode) gen.responseMimeType = "application/json";
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: c.systemPrompt }] },
    contents: [{ role: "user", parts }],
  };
  if (Object.keys(gen).length) body.generationConfig = gen;
  const model = p.model.replace(/^models\//, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) headers["x-goog-api-key"] = p.apiKey;
  return { url: `${trimSlash(p.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, method: "POST", headers, body };
}

export function parseGemini(json: unknown): string {
  const j = json as { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } };
  const parts = j?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map((x) => x.text ?? "").join("");
  if (j?.promptFeedback?.blockReason) throw new Error(`Blocked: ${j.promptFeedback.blockReason}`);
  throw new Error("No candidates in response");
}

export function modelsGemini(p: ProviderConfig): BuiltRequest {
  const headers: Record<string, string> = {};
  if (p.apiKey) headers["x-goog-api-key"] = p.apiKey;
  return { url: `${trimSlash(p.baseUrl)}/models?pageSize=200`, method: "GET", headers, body: null };
}

export function parseModelsGemini(json: unknown): string[] {
  const j = json as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j?.models ?? [])
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}
