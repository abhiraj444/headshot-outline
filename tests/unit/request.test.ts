import { describe, expect, it } from "vitest";
import { buildRequest, redactRequest } from "@/lib/critic/request";
import { newProvider } from "@/lib/store/settings";
import type { ProviderConfig } from "@/lib/critic/types";

const content = { systemPrompt: "SYS", userText: "USER", imageDataUrl: "data:image/jpeg;base64,QUJD" };

function provider(preset: string, patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return { ...newProvider(preset), apiKey: "sk-secret-123", params: {}, ...patch };
}

describe("request builder", () => {
  it("omits every unset optional parameter (OpenAI format)", () => {
    const req = buildRequest(provider("openai"), content);
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(Object.keys(req.body!).sort()).toEqual(["messages", "model"]);
    expect(req.headers.Authorization).toBe("Bearer sk-secret-123");
  });

  it("sends custom params when set (OpenAI format)", () => {
    const req = buildRequest(
      provider("groq", { params: { temperature: 0.2, max_tokens: 300, top_p: 0.9, top_k: 40, frequency_penalty: 0.1, presence_penalty: 0.3, seed: 7, stop: ["END"], json_mode: true } }),
      content,
    );
    expect(req.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(req.body).toMatchObject({
      temperature: 0.2, max_tokens: 300, top_p: 0.9, top_k: 40, frequency_penalty: 0.1, presence_penalty: 0.3, seed: 7, stop: ["END"],
      response_format: { type: "json_object" },
    });
    const user = (req.body!.messages as { role: string; content: { type: string }[] }[])[1];
    expect(user.content.map((c) => c.type)).toEqual(["text", "image_url"]);
  });

  it("deep-merges the custom body JSON last, overriding anything", () => {
    const req = buildRequest(
      provider("openrouter", {
        params: { temperature: 0.2, json_mode: true },
        customBody: '{"temperature": 0.9, "response_format": {"type": "json_schema"}, "provider": {"order": ["x"]}}',
        headers: [{ key: "X-Custom", value: "1" }],
      }),
      content,
    );
    expect(req.body!.temperature).toBe(0.9);
    expect(req.body!.response_format).toEqual({ type: "json_schema" });
    expect(req.body!.provider).toEqual({ order: ["x"] });
    expect(req.headers["X-Custom"]).toBe("1");
  });

  it("maps params to Gemini generationConfig and omits it when empty", () => {
    const bare = buildRequest(provider("gemini", { model: "gemini-2.0-flash" }), content);
    expect(bare.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    expect(bare.body!.generationConfig).toBeUndefined();
    expect(bare.headers["x-goog-api-key"]).toBe("sk-secret-123");
    const full = buildRequest(provider("gemini", { params: { temperature: 0, max_tokens: 200, top_k: 5, stop: ["x"], json_mode: true } }), content);
    expect(full.body!.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 200, topK: 5, stopSequences: ["x"], responseMimeType: "application/json" });
    const parts = (full.body!.contents as { parts: Record<string, unknown>[] }[])[0].parts;
    expect(parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "QUJD" } });
  });

  it("builds Anthropic messages with the required headers", () => {
    const req = buildRequest(provider("anthropic", { params: { top_k: 3, json_mode: true } }), content);
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-secret-123");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    expect(req.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(req.body!.top_k).toBe(3);
    expect(req.body!.temperature).toBeUndefined();
    expect(req.body!.max_tokens).toBe(1024);
    const msgs = req.body!.messages as { role: string }[];
    expect(msgs[msgs.length - 1]).toEqual({ role: "assistant", content: "{" });
  });

  it("redacts the key in the preview", () => {
    const p = provider("openai");
    const red = redactRequest(buildRequest(p, content), p.apiKey);
    expect(JSON.stringify(red)).not.toContain("sk-secret-123");
    expect(red.headers.Authorization).toContain("[redacted]");
  });
});
