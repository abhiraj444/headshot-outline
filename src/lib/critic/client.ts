/**
 * CriticClient (§10): askCritic() with retry policy and provider fallback chain.
 * - 429 / timeout: wait with backoff, retry (provider.params.retries, default 1), then next provider
 * - malformed output: one retry with a stricter reminder, then next provider
 * - auth error: stop immediately (the user must check the key)
 */
import { extractJson, validateCriticReply, type ValidationReport } from "../core/validator";
import type { CriticReply } from "../core/schema";
import { JSON_REMINDER } from "./prompt";
import { buildModelsRequest, buildRequest, parseModels, parseResponseText } from "./request";
import { CriticError, type BuiltRequest, type CriticErrorKind, type ProviderConfig } from "./types";

const DEFAULT_TIMEOUT = 45_000;
const DEFAULT_BACKOFF = 2_000;

/** Request budget: count per provider per session (§10). */
const budget = new Map<string, number>();
export function requestCount(providerId: string) {
  return budget.get(providerId) ?? 0;
}
export function allRequestCounts() {
  return Object.fromEntries(budget);
}

export function classifyHttp(status: number, text: string): { kind: CriticErrorKind; message: string } {
  const lower = text.toLowerCase();
  if (status === 401 || status === 403) return { kind: "auth", message: `Authentication failed (${status}). Check the API key.` };
  if (status === 429) return { kind: "rate_limit", message: "Rate limited (429). Free-tier limit reached; wait or use another provider." };
  if (status === 404 || (status === 400 && /model.*(not found|does not exist|invalid)|unknown model|no such model/.test(lower)))
    return { kind: "not_found", message: `Model or endpoint not found (${status}). Check the model name and base URL.` };
  if (status === 408 || status === 504) return { kind: "timeout", message: `Provider timed out (${status}).` };
  if (status >= 500) return { kind: "server", message: `Provider error (${status}).` };
  if (status === 400) return { kind: "bad_request", message: `Bad request (400): ${text.slice(0, 240)}` };
  return { kind: "unknown", message: `HTTP ${status}: ${text.slice(0, 240)}` };
}

export async function send(p: ProviderConfig, req: BuiltRequest, signal?: AbortSignal): Promise<{ json: unknown; ms: number }> {
  const controller = new AbortController();
  const timeout = p.params.timeout_ms ?? DEFAULT_TIMEOUT;
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeout);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort);
  const t0 = performance.now();
  budget.set(p.id, (budget.get(p.id) ?? 0) + 1);
  try {
    let res: Response;
    try {
      res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted && !signal?.aborted) throw new CriticError("timeout", `No response within ${Math.round(timeout / 1000)} s.`, undefined, p.name);
      if (signal?.aborted) throw new CriticError("unknown", "Cancelled", undefined, p.name);
      throw new CriticError(
        "cors_or_network",
        `Network error or blocked by CORS (${(e as Error).message}). The provider may not allow browser requests, or the URL is unreachable.`,
        undefined,
        p.name,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      const { kind, message } = classifyHttp(res.status, text);
      throw new CriticError(kind, message, res.status, p.name);
    }
    try {
      return { json: JSON.parse(text), ms: Math.round(performance.now() - t0) };
    } catch {
      throw new CriticError("malformed", "Provider returned a non-JSON HTTP body.", res.status, p.name);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); r(); });
  });

export interface CriticAttempt {
  provider: string;
  ok: boolean;
  kind?: CriticErrorKind;
  message?: string;
  ms?: number;
}

export interface CriticResult {
  reply: CriticReply;
  report: ValidationReport;
  provider: ProviderConfig;
  raw: string;
  attempts: CriticAttempt[];
}

/** askCritic({ image, diagnostics, params, round }) → parsed + validated reply, or throws CriticError. */
export async function askCritic(args: {
  providers: ProviderConfig[];
  imageDataUrl: (p: ProviderConfig) => Promise<string>;
  userText: string;
  signal?: AbortSignal;
  onAttempt?: (a: CriticAttempt) => void;
}): Promise<CriticResult> {
  const attempts: CriticAttempt[] = [];
  const note = (a: CriticAttempt) => { attempts.push(a); args.onAttempt?.(a); };
  let lastErr: CriticError | null = null;
  const chain = args.providers.filter((p) => p.enabled);
  if (!chain.length) throw new CriticError("config", "No AI provider is enabled.");
  for (const p of chain) {
    if (!p.model.trim()) { note({ provider: p.name, ok: false, kind: "config", message: "No model set" }); continue; }
    const image = await args.imageDataUrl(p);
    const retries = Math.max(0, Math.min(5, p.params.retries ?? 1));
    const backoff = p.params.backoff_ms ?? DEFAULT_BACKOFF;
    let transientLeft = retries;
    let malformedLeft = 1;
    let reminder: string | undefined;
    for (;;) {
      const req = buildRequest(p, { systemPrompt: p.systemPrompt, userText: args.userText, imageDataUrl: image, reminder });
      try {
        const { json, ms } = await send(p, req, args.signal);
        const text = parseResponseText(p, json, req);
        let parsed: unknown;
        try {
          parsed = extractJson(text);
        } catch {
          throw new CriticError("malformed", "Reply was not valid JSON.", undefined, p.name);
        }
        const { reply, report } = validateCriticReply(parsed);
        note({ provider: p.name, ok: true, ms });
        return { reply, report, provider: p, raw: text, attempts };
      } catch (e) {
        const err = e instanceof CriticError ? e : new CriticError("unknown", (e as Error).message, undefined, p.name);
        lastErr = err;
        note({ provider: p.name, ok: false, kind: err.kind, message: err.message });
        if (args.signal?.aborted) throw err;
        if (err.kind === "auth") throw err; // stop immediately
        if ((err.kind === "rate_limit" || err.kind === "timeout") && transientLeft > 0) {
          transientLeft--;
          await sleep(backoff * (retries - transientLeft), args.signal);
          continue;
        }
        if (err.kind === "malformed" && malformedLeft > 0) {
          malformedLeft--;
          reminder = JSON_REMINDER;
          continue;
        }
        break; // next provider
      }
    }
  }
  throw lastErr ?? new CriticError("unknown", "All providers failed.");
}

export async function testConnection(p: ProviderConfig): Promise<{ ok: boolean; ms: number; message: string; sample?: string }> {
  const req = buildRequest(p, {
    systemPrompt: "Reply with JSON only.",
    userText: 'Reply with exactly {"ok":true}',
  });
  const t0 = performance.now();
  try {
    const { json, ms } = await send(p, req);
    const text = parseResponseText(p, json, req);
    return { ok: true, ms, message: `Connected in ${ms} ms`, sample: text.slice(0, 200) };
  } catch (e) {
    const err = e as CriticError;
    return { ok: false, ms: Math.round(performance.now() - t0), message: `${err.kind ? `[${err.kind}] ` : ""}${err.message}` };
  }
}

export async function fetchModels(p: ProviderConfig): Promise<string[]> {
  const req = buildModelsRequest(p);
  const { json } = await send(p, req);
  return parseModels(p, json);
}
