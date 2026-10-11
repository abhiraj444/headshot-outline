/**
 * Validator (tech doc §5, §8.5, §14): all AI output is untrusted data.
 * - unknown keys are dropped
 * - out-of-range numbers are clamped
 * - wrong types cause that single field to be ignored
 * - enum/set values must come from allow-lists
 */
import { flatten, unflatten, deepMerge, isPlainObject, clone } from "./params";
import {
  CHECKLIST_KEYS,
  DEFAULT_PARAMS,
  ISSUE_TYPES,
  PARAM_SPECS,
  REGIONS,
  SCHEMA_VERSION,
  type Checklist,
  type CriticReply,
  type Issue,
  type ParamPatch,
  type Params,
} from "./schema";

export interface ValidationReport {
  dropped: string[];
  clamped: { path: string; from: number; to: number }[];
  ignored: string[];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Validate a (partial) param patch. When `aiOnly` is set, fields the AI may not touch are dropped. */
export function validatePatch(
  raw: unknown,
  opts: { aiOnly?: boolean } = {},
): { patch: ParamPatch; report: ValidationReport } {
  const report: ValidationReport = { dropped: [], clamped: [], ignored: [] };
  if (!isPlainObject(raw)) return { patch: {}, report };
  const flat = flatten(raw);
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    if (path === "schema_version") continue;
    const spec = PARAM_SPECS[path];
    if (!spec) {
      report.dropped.push(path);
      continue;
    }
    if (opts.aiOnly && !spec.ai) {
      report.dropped.push(path);
      continue;
    }
    switch (spec.kind) {
      case "number":
      case "int": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          report.ignored.push(path);
          break;
        }
        let v = clamp(value, spec.min, spec.max);
        if (spec.kind === "int") v = Math.round(v);
        if (v !== value) report.clamped.push({ path, from: value, to: v });
        out[path] = v;
        break;
      }
      case "boolean":
        if (typeof value !== "boolean") report.ignored.push(path);
        else out[path] = value;
        break;
      case "enum":
        if (typeof value !== "string" || !spec.values.includes(value)) report.ignored.push(path);
        else out[path] = value;
        break;
      case "set": {
        if (!Array.isArray(value)) {
          report.ignored.push(path);
          break;
        }
        const filtered = Array.from(new Set(value.filter((x) => typeof x === "string" && spec.values.includes(x))));
        if (filtered.length !== value.length) report.dropped.push(`${path}[invalid items]`);
        out[path] = filtered;
        break;
      }
    }
  }
  return { patch: unflatten(out) as ParamPatch, report };
}

/** Validate a full params object (e.g. imported / edited JSON); missing fields fall back to defaults. */
export function validateParams(raw: unknown): { params: Params; report: ValidationReport } {
  const { patch, report } = validatePatch(raw);
  const params = deepMerge(clone(DEFAULT_PARAMS), patch);
  params.schema_version = SCHEMA_VERSION;
  return { params, report };
}

function normBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "yes" || s === "true") return true;
    if (s === "no" || s === "false") return false;
  }
  return undefined;
}

export function validateChecklist(raw: unknown): Checklist {
  const out: Checklist = {};
  if (!isPlainObject(raw)) return out;
  for (const k of CHECKLIST_KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === "glasses_included") {
      const s = typeof v === "string" ? v.trim().toLowerCase() : typeof v === "boolean" ? (v ? "yes" : "no") : "";
      if (s === "yes" || s === "no" || s === "na" || s === "n/a") out[k] = s === "n/a" ? "na" : (s as "yes" | "no" | "na");
    } else {
      const b = normBool(v);
      if (b !== undefined) out[k] = b;
    }
  }
  return out;
}

export function validateIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return [];
  const out: Issue[] = [];
  for (const it of raw.slice(0, 12)) {
    if (!isPlainObject(it)) continue;
    const type = (ISSUE_TYPES as readonly string[]).includes(String(it.type)) ? (it.type as Issue["type"]) : "other";
    const region = (REGIONS as readonly string[]).includes(String(it.region)) ? (it.region as Issue["region"]) : "inside";
    const sev = typeof it.severity === "number" && Number.isFinite(it.severity) ? Math.round(clamp(it.severity, 1, 3)) : 1;
    out.push({ type, region, severity: sev });
  }
  return out;
}

/** Strip code fences / leading prose and parse the first JSON object. Throws on failure. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("Reply is not JSON");
  }
}

export function validateCriticReply(raw: unknown): { reply: CriticReply; report: ValidationReport } {
  if (!isPlainObject(raw)) throw new Error("Reply is not a JSON object");
  const { patch, report } = validatePatch(raw.patch, { aiOnly: true });
  return {
    reply: { checklist: validateChecklist(raw.checklist), issues: validateIssues(raw.issues), patch },
    report,
  };
}
