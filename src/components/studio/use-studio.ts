"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { clone } from "@/lib/core/params";
import { DETAIL_PRESETS, type Params } from "@/lib/core/schema";
import { askCritic } from "@/lib/critic/client";
import { composeReviewImage } from "@/lib/critic/composer";
import { buildUserText } from "@/lib/critic/prompt";
import { addEntry, findBest } from "@/lib/memory/tuning";
import { runLoop, type LoopOutcome, type RoundRecord } from "@/lib/orchestrator/loop";
import type { Nudge } from "@/lib/pipeline/combine";
import type { LandmarkLines } from "@/lib/pipeline/features";
import type { RunOutput } from "@/lib/pipeline/run";
import { useSettings, type StudioDetail } from "@/lib/store/settings";
import { downscale, loadImage, type LoadedImage } from "@/lib/ui/imageio";
import { InferenceClient, WorkerError } from "@/lib/workers/client";
import type { SegmentResult } from "@/lib/workers/protocol";

export type Phase = "idle" | "loading_models" | "processing" | "refining" | "done" | "done_best_effort" | "error";

export const STEPS = ["Models", "Segment", "Outline", "Review"] as const;

export interface ModelProgress {
  stage: "matte" | "parsing";
  pct: number;
  status: string;
}

export function applyDetail(p: Params, d: StudioDetail): Params {
  const out = clone(p);
  out.features.enabled = DETAIL_PRESETS[d].enabled;
  out.features.detail = DETAIL_PRESETS[d].detail;
  return out;
}

export function useStudio() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [caption, setCaption] = useState("");
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<LoopOutcome | null>(null);
  const [seg, setSeg] = useState<SegmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [override, setOverride] = useState<{ result: RunOutput; params: Params } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busyLocal, setBusyLocal] = useState(false);
  const [drawKey, setDrawKey] = useState(0);

  const clientRef = useRef<InferenceClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const consentResolver = useRef<((v: boolean) => void) | null>(null);
  const landmarksRef = useRef<LandmarkLines | null>(null);
  const roundsRef = useRef<RoundRecord[]>([]);

  useEffect(() => () => clientRef.current?.terminate(), []);

  const getClient = () => {
    if (!clientRef.current) {
      clientRef.current = new InferenceClient();
    }
    clientRef.current.onProgress = (e) => {
      if (e.type === "progress") {
        setProgress({ stage: e.stage, pct: e.progress, status: e.status });
      } else {
        setCaption(e.message);
        if (/separating|finding/i.test(e.message)) {
          setPhase("processing");
          setStep(1);
        }
      }
    };
    return clientRef.current;
  };

  const resolveConsent = useCallback((v: boolean, remember: boolean) => {
    if (v && remember) useSettings.getState().setPrivacyAccepted(true);
    setConsentOpen(false);
    consentResolver.current?.(v);
    consentResolver.current = null;
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setStep(0);
    setImage(null);
    setProgress(null);
    setCaption("");
    setRounds([]);
    roundsRef.current = [];
    setSelected(null);
    setOutcome(null);
    setSeg(null);
    setError(null);
    setNudges([]);
    setOverride(null);
  }, []);

  const start = useCallback(async (file: Blob, name = "photo") => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const settings = useSettings.getState();
    setError(null);
    setOutcome(null);
    setRounds([]);
    roundsRef.current = [];
    setSelected(null);
    setNudges([]);
    setOverride(null);
    setProgress(null);
    setSeg(null);
    landmarksRef.current = null;
    let img: LoadedImage;
    try {
      img = await loadImage(file, name, settings.runtime.workingSize);
    } catch (e) {
      setPhase("error");
      setError((e as Error).message || "Could not read that image.");
      return;
    }
    setImage(img);
    setPhase("loading_models");
    setStep(0);
    setCaption("Preparing on-device models");
    const client = getClient();
    let startParams = applyDetail(settings.algorithm, settings.studioDetail);
    let segResult: SegmentResult;
    const segment = (im: LoadedImage) =>
      client.segment({
        imageId: im.id, w: im.w, h: im.h, rgba: im.rgba,
        matteModel: startParams.matte.model, matteEnabled: startParams.matte.enabled,
        parsingEnabled: startParams.parsing.enabled, device: settings.runtime.device,
      });
    try {
      try {
        segResult = await segment(img);
      } catch (e) {
        if (e instanceof WorkerError && e.oom) {
          // §13 out-of-memory: reduce working resolution and retry
          toast.info("Large photo — retrying at a lower working resolution.");
          img = await downscale(img, 640);
          setImage(img);
          segResult = await segment(img);
        } else throw e;
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase("error");
      setError(`The on-device models could not run: ${(e as Error).message}`);
      return;
    }
    if (ac.signal.aborted) return;
    setSeg(segResult);
    if (segResult.noPerson) {
      setPhase("error");
      setError("No person found in this photo. Try a photo where a face or head is clearly visible.");
      return;
    }
    if (!segResult.matteOk && !segResult.parsingOk) {
      toast.warning("The AI models could not load, so a classical fallback is used. Quality may be lower.");
      startParams = clone(startParams);
      startParams.fallback.use_grabcut = true;
    } else if (segResult.warnings.length) {
      toast.warning("Some models failed to load; quality may be lower.", { description: segResult.warnings[0] });
    }
    // Optional MediaPipe landmark refinement (features only)
    if (settings.runtime.useLandmarks && startParams.features.enabled && startParams.features.detail !== "outline_only") {
      try {
        setCaption("Locating facial landmarks");
        const { detectLandmarkLines } = await import("@/lib/pipeline/landmarks");
        landmarksRef.current = await detectLandmarkLines(img.canvas);
      } catch {
        landmarksRef.current = null;
      }
    }
    setPhase("processing");
    setStep(2);
    const currentImg = img;
    try {
      const out = await runLoop(startParams, {
        signal: ac.signal,
        settings: () => {
          const s = useSettings.getState();
          return { loop: s.loop, providers: s.providers };
        },
        run: (params) => client.run(params, [], landmarksRef.current),
        compose: async (result, provider) =>
          composeReviewImage({
            source: currentImg.canvas, w: result.w, h: result.h, outline: result.outline, features: result.features,
            maxWidth: provider.imageMaxWidth, quality: provider.jpegQuality,
          }),
        critic: ({ providers, image, round, params, result, onAttempt }) =>
          askCritic({
            providers,
            imageDataUrl: image,
            userText: buildUserText({ params, metrics: result.metrics, round, featuresEnabled: params.features.enabled && params.features.detail !== "outline_only" }),
            signal: ac.signal,
            onAttempt,
          }),
        consent: () => {
          if (useSettings.getState().privacyAccepted) return Promise.resolve(true);
          return new Promise<boolean>((resolve) => {
            consentResolver.current = resolve;
            setConsentOpen(true);
          });
        },
        memoryLookup: (result) => findBest(result.imageClass),
        memorySave: (best, n) =>
          addEntry({ image_class: best.result.imageClass, params: best.params, final_score: best.score, passed: true, rounds_needed: n }),
        onEvent: (e) => {
          if (ac.signal.aborted) return;
          setCaption(e.caption);
          if (e.state === "CRITIQUE") {
            setPhase("refining");
            setStep(3);
          }
          if (e.record) {
            const rec = e.record;
            const list = roundsRef.current.slice();
            const i = list.findIndex((r) => r.index === rec.index);
            if (i >= 0) list[i] = { ...rec };
            else list.push({ ...rec });
            roundsRef.current = list;
            setRounds(list);
            if (e.state === "EVALUATE") {
              setSelected(rec.index);
              setDrawKey((k) => k + 1);
            }
          }
        },
      });
      if (ac.signal.aborted) return;
      setOutcome(out);
      setSelected(out.best.index);
      setDrawKey((k) => k + 1);
      setStep(4);
      const clean = out.terminal === "PASS" || (out.terminal === "METRICS_ONLY" && out.best.result.metricsPass);
      setPhase(clean ? "done" : "done_best_effort");
      setCaption(out.message);
      if (out.error?.kind === "auth") toast.error("AI provider rejected the key", { description: out.message });
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || ac.signal.aborted) return;
      setPhase("error");
      setError(`Processing failed: ${(e as Error).message}`);
    }
  }, []);

  const shown: { result: RunOutput; params: Params } | null = (() => {
    if (override) return override;
    const rec = rounds.find((r) => r.index === selected) ?? outcome?.best ?? rounds[rounds.length - 1];
    return rec ? { result: rec.result, params: rec.params } : null;
  })();

  /** Rerun locally (no AI) from the shown params with nudges / a new detail level. */
  const rerunLocal = useCallback(
    async (nextNudges: Nudge[], detail?: StudioDetail) => {
      const client = clientRef.current;
      const base = override?.params ?? rounds.find((r) => r.index === selected)?.params ?? outcome?.best.params;
      if (!client || !base) return;
      const params = detail ? applyDetail(base, detail) : base;
      if (detail && params.features.enabled && params.features.detail !== "outline_only" && !landmarksRef.current && useSettings.getState().runtime.useLandmarks && image) {
        try {
          const { detectLandmarkLines } = await import("@/lib/pipeline/landmarks");
          landmarksRef.current = await detectLandmarkLines(image.canvas);
        } catch { /* parsing-only */ }
      }
      setBusyLocal(true);
      try {
        const result = await client.run(params, nextNudges, landmarksRef.current);
        setOverride({ result, params });
        setDrawKey((k) => k + 1);
      } catch (e) {
        toast.error("Could not update the outline", { description: (e as Error).message });
      } finally {
        setBusyLocal(false);
      }
    },
    [override, rounds, selected, outcome, image],
  );

  const addNudge = useCallback(
    (n: Nudge) => {
      const next = [...nudges, n];
      setNudges(next);
      return next;
    },
    [nudges],
  );

  return {
    phase, step, image, progress, caption, rounds, selected, setSelected: (i: number) => { setOverride(null); setNudges([]); setSelected(i); setDrawKey((k) => k + 1); },
    outcome, seg, error, nudges, setNudges, addNudge, shown, consentOpen, resolveConsent, start, reset, rerunLocal, busyLocal, drawKey,
    hasOverride: !!override,
  };
}
