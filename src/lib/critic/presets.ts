import type { ApiFormat } from "./types";

export interface ProviderPreset {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  /** suggested vision model (editable) */
  model: string;
  keyRequired: boolean;
  headers?: { key: string; value: string }[];
  note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "openai", name: "OpenAI", format: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyRequired: true },
  { id: "gemini", name: "Google Gemini", format: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash", keyRequired: true, note: "Free tier available; free-tier prompts may be used for training." },
  { id: "anthropic", name: "Anthropic", format: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-haiku-latest", keyRequired: true },
  {
    id: "openrouter", name: "OpenRouter", format: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.2-11b-vision-instruct:free", keyRequired: true,
    headers: [{ key: "X-Title", value: "Headshot Outline" }], note: "Pick a vision model; ':free' models have tight rate limits.",
  },
  { id: "groq", name: "Groq", format: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "meta-llama/llama-4-scout-17b-16e-instruct", keyRequired: true },
  { id: "mistral", name: "Mistral", format: "openai", baseUrl: "https://api.mistral.ai/v1", model: "pixtral-12b-2409", keyRequired: true },
  { id: "together", name: "Together", format: "openai", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo", keyRequired: true },
  { id: "xai", name: "xAI", format: "openai", baseUrl: "https://api.x.ai/v1", model: "grok-2-vision-1212", keyRequired: true },
  { id: "ollama", name: "Ollama (local)", format: "openai", baseUrl: "http://localhost:11434/v1", model: "llava", keyRequired: false, note: "Start Ollama with OLLAMA_ORIGINS set to this site's origin to allow browser requests." },
  { id: "lmstudio", name: "LM Studio (local)", format: "openai", baseUrl: "http://localhost:1234/v1", model: "", keyRequired: false, note: "Enable CORS in LM Studio's server settings." },
  { id: "custom", name: "Custom (OpenAI-compatible)", format: "openai", baseUrl: "https://", model: "", keyRequired: false },
];

export function presetById(id: string) {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}
