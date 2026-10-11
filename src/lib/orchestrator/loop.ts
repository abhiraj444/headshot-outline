/**
 * Orchestration loop (§9):
 * INIT → RUN → EVALUATE → (PASS | CRITIQUE) → VALIDATE → APPLY → RUN …
 * Terminal: PASS, MAX_ROUNDS, STALLED, CRITIC_ERROR (+ METRICS_ONLY when no critic is used).
 * All terminal states return the best result seen.
 */
import { applyPatch, clone, diffParams, paramsEqual } from "../core/params";
import type { CriticReply, Issue, ParamPatch, Params } from "../core/schema";
import type { ValidationReport } from "../core/validator";
import { checklistFailures, checklistFraction, combinedScore } from "../eval/score";
import type { CriticAttempt, CriticResult } from "../critic/client";
import { CriticError, type ProviderConfig } from "../critic/types";
import type { RunOutput } from "../pipeline/run";
import type { TuningEntry } from "../memory/tuning";
import { OscillationGuard, type GuardAction } from "./oscillation";

export type LoopState =
  | "INIT" | "RUN" | "EVALUATE" | "CRITIQUE" | "VALIDATE" | "APPLY"
  | "PASS" | "MAX_ROUNDS" | "STALLED" | "CRITIC_ERROR" | "METRICS_ONLY";

export type Terminal = Extract<LoopState, "PASS" | "MAX_ROUNDS" | "STALLED" | "CRITIC_ERROR" | "METRICS_ONLY">;

export interface RoundRecord {
  index: number;
  label: string;
  params: Params;
  result: RunOutput;
  reviewed: boolean;
  checklist?: CriticReply["checklist"];
  issues?: Issue[];
  patchProposed?: ParamPatch;
  patchApplied?: ParamPatch;
  validation?: ValidationReport;
  guardActions?: GuardAction[];
  diff?: { path: string; from: unknown; to: unknown }[];
  checklistFrac?: number;
  score: number;
  caption: string;
  provider?: string;
  attempts?: CriticAttempt[];
  reviewImage?: string;
}

export interface LoopSettingsLike {
  passThreshold: number;
  maxRounds: number;
  skipAiWhenMetricsPass: boolean;
  alwaysCriticOnce: boolean;
  weights: { checklist: number; metrics: number };
  stallRounds: number;
  useTuningMemory: boolean;
}

export interface LoopEvent {
  state: LoopState;
  round: number;
  caption: string;
  record?: RoundRecord;
}

export interface LoopDeps {
  run: (params: Params) => Promise<RunOutput>;
  compose: (result: RunOutput, provider: ProviderConfig) => Promise<string>;
  critic: (args: { providers: ProviderConfig[]; image: (p: ProviderConfig) => Promise<string>; round: number; params: Params; result: RunOutput; onAttempt: (a: CriticAttempt) => void }) => Promise<CriticResult>;
  settings: () => { loop: LoopSettingsLike; providers: ProviderConfig[] };
  consent: () => Promise<boolean>;
  memoryLookup?: (result: RunOutput) => Promise<TuningEntry | null>;
  memorySave?: (best: RoundRecord, rounds: number) => Promise<void>;
  onEvent: (e: LoopEvent) => void;
  signal?: AbortSignal;
}

export interface LoopOutcome {
  terminal: Terminal;
  best: RoundRecord;
  rounds: RoundRecord[];
  criticUsed: boolean;
  passed: boolean;
  message: string;
  error?: CriticError;
}

export const ISSUE_CAPTIONS: Record<Issue["type"], string> = {
  neck_leak: "trimming the neck",
  collar_leak: "removing the collar",
  hair_cut: "bringing back the hair",
  background_leak: "removing background",
  fragment: "removing stray pieces",
  hole: "filling holes",
  glasses_missing: "adding the glasses",
  hat_issue: "fixing the hat",
  feature_missing: "adding missing features",
  feature_misplaced: "re-aligning the features",
  feature_noise: "cleaning up feature lines",
  other: "fine-tuning the outline",
};

export function captionFor(issues: Issue[] | undefined, fallback = "checking the outline"): string {
  if (!issues?.length) return fallback;
  const top = issues.slice().sort((a, b) => b.severity - a.severity)[0];
  return ISSUE_CAPTIONS[top.type] ?? fallback;
}

function isEmptyPatch(p: ParamPatch) {
  return !Object.values(p).some((v) => v && Object.keys(v).length);
}

function farOutOfRange(r: RunOutput): boolean {
  if (r.tiny) return true;
  const comps = r.metrics.find((m) => m.key === "components")?.value ?? 1;
  const ratio = r.metrics.find((m) => m.key === "head_area_ratio")?.value;
  return comps > 4 || (ratio != null && ratio > 0.8);
}

export async function runLoop(start: Params, deps: LoopDeps): Promise<LoopOutcome> {
  const { loop, providers } = deps.settings();
  const rounds: RoundRecord[] = [];
  const emit = (state: LoopState, round: number, caption: string, record?: RoundRecord) => deps.onEvent({ state, round, caption, record });
  const guard = new OscillationGuard();
  const checkAbort = () => { if (deps.signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };

  // INIT + RUN (round 0)
  emit("INIT", 0, "preparing");
  let params = clone(start);
  emit("RUN", 0, "drawing the outline");
  let result = await deps.run(params);
  checkAbort();

  // §13: empty / tiny mask or far out of range on the first run → GrabCut fallback, rerun once
  if (farOutOfRange(result) && !params.fallback.use_grabcut) {
    emit("RUN", 0, "trying the classical fallback");
    const alt = clone(params);
    alt.fallback.use_grabcut = true;
    const altRes = await deps.run(alt);
    if (!altRes.tiny && altRes.metricScore >= result.metricScore) { params = alt; result = altRes; }
  }

  // INIT from TuningMemory when a close match exists
  if (loop.useTuningMemory && deps.memoryLookup) {
    const entry = await deps.memoryLookup(result).catch(() => null);
    if (entry && !paramsEqual(entry.params, params)) {
      const memParams: Params = { ...clone(entry.params), features: clone(params.features), outline: { ...entry.params.outline, stroke_px: params.outline.stroke_px } };
      emit("RUN", 0, "starting from a preset that worked before");
      const memRes = await deps.run(memParams);
      if (memRes.metricScore > result.metricScore) { params = memParams; result = memRes; }
    }
  }

  guard.record(params);
  emit("EVALUATE", 0, "checking the outline");
  let current: RoundRecord = { index: 0, label: "First pass", params, result, reviewed: false, score: result.metricScore, caption: "first pass" };
  rounds.push(current);
  emit("EVALUATE", 0, "checking the outline", current);
  let best = current;

  const done = (terminal: Terminal, message: string, error?: CriticError): LoopOutcome => {
    const passed = terminal === "PASS";
    if (passed && loop.useTuningMemory && deps.memorySave) deps.memorySave(best, rounds.length - 1).catch(() => {});
    emit(terminal, rounds.length - 1, message, best);
    return { terminal, best, rounds, criticUsed: rounds.some((r) => r.reviewed), passed, message, error };
  };

  const enabled = providers.filter((p) => p.enabled);
  const metricsPass = result.metricsPass;
  if (metricsPass && loop.skipAiWhenMetricsPass && !loop.alwaysCriticOnce) {
    return done("PASS", "All local checks passed — no AI call needed.");
  }
  if (!enabled.length) {
    return done("METRICS_ONLY", metricsPass ? "Checked by local metrics only (no AI provider set up)." : "Some checks failed and no AI provider is set up to refine it.");
  }
  if (!(await deps.consent())) {
    return done("METRICS_ONLY", "AI review skipped — the photo stayed on your device.");
  }

  let prevScore = -1;
  let noImprove = 0;
  for (let round = 1; round <= Math.max(1, loop.maxRounds); round++) {
    checkAbort();
    emit("CRITIQUE", round, "asking the AI reviewer");
    const attempts: CriticAttempt[] = [];
    let cr: CriticResult;
    let reviewImage = "";
    try {
      cr = await deps.critic({
        providers: enabled,
        round,
        params: current.params,
        result: current.result,
        onAttempt: (a) => attempts.push(a),
        image: async (p) => (reviewImage = await deps.compose(current.result, p)),
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      const err = e instanceof CriticError ? e : new CriticError("unknown", (e as Error).message);
      current.attempts = attempts;
      return done("CRITIC_ERROR", err.kind === "auth" ? `${err.provider ?? "Provider"}: ${err.message}` : `AI reviewer unavailable: ${err.message}`, err);
    }
    checkAbort();
    const featuresOn = current.params.features.enabled && current.params.features.detail !== "outline_only";
    const frac = checklistFraction(cr.reply.checklist, featuresOn);
    const score = combinedScore(frac, current.result.metricScore, loop.weights);
    Object.assign(current, {
      reviewed: true,
      checklist: cr.reply.checklist,
      issues: cr.reply.issues,
      patchProposed: cr.reply.patch,
      validation: cr.report,
      checklistFrac: frac,
      score,
      caption: captionFor(cr.reply.issues, checklistFailures(cr.reply.checklist, featuresOn).length ? "fine-tuning the outline" : "looks good"),
      provider: cr.provider.name,
      attempts,
      reviewImage,
    } satisfies Partial<RoundRecord>);
    if (score > best.score || !best.reviewed) best = current;
    emit("VALIDATE", round, current.caption, current);

    if (score >= loop.passThreshold && current.result.metricsPass && !checklistFailures(cr.reply.checklist, featuresOn).length) {
      best = current;
      return done("PASS", "Passed the AI checklist and local metrics.");
    }
    if (score >= loop.passThreshold && current.result.metricsPass) {
      best = current;
      return done("PASS", "Score above the pass threshold.");
    }
    if (round >= loop.maxRounds) return done("MAX_ROUNDS", "Reached the round limit — showing the best result.");

    // stall: no improvement for N consecutive rounds
    if (prevScore >= 0 && score <= prevScore + 1e-6) noImprove++;
    else noImprove = 0;
    prevScore = Math.max(prevScore, score);
    if (noImprove >= loop.stallRounds) return done("STALLED", "Stopped improving — showing the best result.");

    // VALIDATE (already validated/clamped by the client) + oscillation guard
    const { patch, actions } = guard.guard(current.params, cr.reply.patch);
    current.guardActions = actions;
    if (isEmptyPatch(patch)) return done("STALLED", "The reviewer had no further changes — showing the best result.");
    const next = applyPatch(current.params, patch);
    if (paramsEqual(next, current.params)) return done("STALLED", "No parameter change — showing the best result.");
    current.patchApplied = patch;
    current.diff = diffParams(current.params, next);

    emit("APPLY", round, current.caption, current);
    emit("RUN", round, current.caption);
    const res = await deps.run(next);
    guard.record(next);
    const rec: RoundRecord = { index: round, label: `Round ${round}`, params: next, result: res, reviewed: false, score: res.metricScore, caption: current.caption };
    rounds.push(rec);
    emit("EVALUATE", round, current.caption, rec);
    current = rec;
  }
  return done("MAX_ROUNDS", "Reached the round limit — showing the best result.");
}
