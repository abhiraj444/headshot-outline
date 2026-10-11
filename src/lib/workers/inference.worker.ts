/// <reference lib="webworker" />
/**
 * Inference worker: all heavy work (model inference + mask math) runs here (§3, §15).
 * Matte:   pipeline('background-removal', 'Xenova/modnet') → fallback 'briaai/RMBG-1.4'
 * Parsing: pipeline('image-segmentation', 'jonathandinu/face-parsing') (CelebAMask-HQ labels)
 * Device:  WebGPU when available, else WASM.
 */
import { env, pipeline, RawImage } from "@huggingface/transformers";
import { matteFallbackChain, matteFromRGBA } from "../pipeline/matte";
import { CELEBA_LABELS, labelMapFromSegments, PARSING_MODEL_ID } from "../pipeline/parsing";
import { noPersonDetected, PipelineRunner, type ImageState } from "../pipeline/run";
import type { DevicePref, SegmentResult, WorkerRequest, WorkerResponse } from "./protocol";

env.allowLocalModels = false;
env.useBrowserCache = true;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(m, transfer);

type AnyPipe = (input: unknown, opts?: unknown) => Promise<unknown>;
const pipes = new Map<string, AnyPipe>();
let runner: PipelineRunner | null = null;

async function pickDevice(pref: DevicePref): Promise<"webgpu" | "wasm"> {
  if (pref === "wasm") return "wasm";
  if (pref === "webgpu") {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return "wasm";
    try {
      const adapter = await gpu.requestAdapter();
      return adapter ? "webgpu" : "wasm";
    } catch {
      return "wasm";
    }
  }
  // For 'auto': prefer wasm. WebAssembly SIMD runs inside the dedicated worker without
  // ever freezing Chrome's GPU process or locking up browser tab threads.
  return "wasm";
}

async function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${msg} (timed out after ${Math.round(ms / 1000)}s)`)), ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    clearTimeout(timer!);
  }
}

async function loadPipe(
  task: "background-removal" | "image-segmentation",
  model: string,
  device: "webgpu" | "wasm",
  id: number,
  stage: "matte" | "parsing",
): Promise<AnyPipe> {
  const key = `${task}|${model}|${device}`;
  const cached = pipes.get(key);
  if (cached) return cached;
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let l = 0, t = 0;
      for (const v of files.values()) { l += v.loaded; t += v.total; }
      post({ type: "progress", id, stage, file: p.file, progress: t ? l / t : 0, status: `Downloading ${model}` });
    } else if (p.status === "ready") {
      post({ type: "progress", id, stage, progress: 1, status: `${model} ready` });
    }
  };
  // Preferred weights per model (sizes: face-parsing q8 ≈ 89 MB vs fp32 ≈ 340 MB; MODNet fp32 ≈ 26 MB;
  // RMBG-1.4 q8 ≈ 44 MB / fp16 ≈ 88 MB).
  // Note: WebGPU in ONNX Runtime Web does NOT support q8 quantization; must use fp32 or fp16.
  const DTYPES: Record<string, string[]> = {
    [PARSING_MODEL_ID]: device === "webgpu" ? ["fp32"] : ["q8", "fp32"],
    "Xenova/modnet": ["fp32", "q8"],
    "briaai/RMBG-1.4": device === "webgpu" ? ["fp16", "fp32"] : ["q8", "fp32"],
  };
  const dtypes = DTYPES[model] ?? ["fp32"];
  const attempts: Record<string, unknown>[] = [
    ...dtypes.map((dtype) => ({ device, dtype, progress_callback })),
    ...(device === "webgpu" ? [{ device: "wasm", dtype: dtypes[0], progress_callback }] : []),
  ];
  let lastErr: unknown;
  for (const opts of attempts) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (await (pipeline as any)(task, model, opts)) as AnyPipe;
      pipes.set(key, p);
      return p;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function isOom(e: unknown) {
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return m.includes("memory") || m.includes("allocation") || m.includes("oom");
}

/** Downscale RGBA buffer to maximum side length (default 512px) for model inference */
function resizeForInference(rgba: Uint8ClampedArray, w: number, h: number, maxSide = 512): RawImage {
  if (Math.max(w, h) <= maxSide) {
    return new RawImage(rgba, w, h, 4);
  }
  const scale = maxSide / Math.max(w, h);
  const rw = Math.max(16, Math.round(w * scale));
  const rh = Math.max(16, Math.round(h * scale));
  const dst = new Uint8ClampedArray(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < rw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      const sidx = (sy * w + sx) * 4;
      const didx = (y * rw + x) * 4;
      dst[didx] = rgba[sidx];
      dst[didx + 1] = rgba[sidx + 1];
      dst[didx + 2] = rgba[sidx + 2];
      dst[didx + 3] = rgba[sidx + 3];
    }
  }
  return new RawImage(dst, rw, rh, 4);
}

async function handleSegment(req: Extract<WorkerRequest, { type: "segment" }>) {
  const t0 = performance.now();
  const { w, h, rgba, id } = req;
  const device = await pickDevice(req.device);
  const warnings: string[] = [];

  // Downscale image to 512px max for lightning-fast, crash-proof model inference.
  // Both MODNet and SegFormer are natively trained on 512x512.
  // Upsampling output masks back to (w, h) maintains crisp full-resolution outlines.
  const modelInput = resizeForInference(rgba, w, h, 512);

  let matte: Float32Array | null = null;
  let matteModel: string | null = null;
  if (req.matteEnabled) {
    for (const model of matteFallbackChain(req.matteModel)) {
      try {
        post({ type: "status", id, message: `Loading matte model ${model}` });
        const p = await withTimeout(
          loadPipe("background-removal", model, device, id, "matte"),
          30_000,
          `Loading matte model ${model}`,
        );
        post({ type: "status", id, message: "Separating the person from the background" });
        const out = (await withTimeout(
          p(modelInput) as Promise<RawImage[]>,
          30_000,
          "Matte model inference",
        )) as RawImage[];
        matte = matteFromRGBA(out[0] as unknown as { data: Uint8ClampedArray; width: number; height: number; channels: number }, w, h);
        matteModel = model;
        break;
      } catch (e) {
        if (isOom(e)) throw e;
        warnings.push(`Matte model ${model} failed: ${(e as Error).message}`);
      }
    }
  }
  let labels: Uint8Array | null = null;
  if (req.parsingEnabled) {
    try {
      post({ type: "status", id, message: "Loading face-parsing model" });
      const seg = await withTimeout(
        loadPipe("image-segmentation", PARSING_MODEL_ID, device, id, "parsing"),
        40_000,
        "Loading face-parsing model",
      );
      post({ type: "status", id, message: "Finding face, hair, ears and glasses" });
      type Seg = { label: string | null; mask: RawImage };
      const segOutput = (await withTimeout(
        seg(modelInput) as Promise<Seg[]>,
        35_000,
        "Face parsing inference",
      )) as Seg[];
      // labelMapFromSegments upsamples masks from 512px to full working size (w, h)
      labels = labelMapFromSegments(segOutput, w, h);
    } catch (e) {
      if (isOom(e)) throw e;
      warnings.push(`Face parsing failed: ${(e as Error).message}`);
    }
  }
  const state: ImageState = { id: req.imageId, w, h, rgba, matte, labels };
  runner = new PipelineRunner(state);
  const present = new Set<string>();
  if (labels) for (let i = 0; i < labels.length; i += 7) if (labels[i] < CELEBA_LABELS.length) present.add(CELEBA_LABELS[labels[i]]);
  const result: SegmentResult = {
    device,
    matteModel,
    matteOk: !!matte,
    parsingOk: !!labels,
    noPerson: noPersonDetected(state),
    labelsPresent: [...present],
    warnings,
    ms: Math.round(performance.now() - t0),
  };
  post({ type: "segmented", id, result });
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (req.type === "segment") await handleSegment(req);
    else if (req.type === "run") {
      if (!runner) throw new Error("No image loaded");
      const result = await runner.run(req.params, req.nudges, req.landmarks);
      post({ type: "ran", id: req.id, result }, [result.cutout.buffer]);
    }
  } catch (e) {
    post({ type: "error", id: req.id, message: (e as Error)?.message ?? String(e), oom: isOom(e) });
  }
};
