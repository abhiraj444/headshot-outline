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
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return "wasm";
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
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
  const DTYPES: Record<string, string[]> = {
    [PARSING_MODEL_ID]: ["q8", "fp32"],
    "Xenova/modnet": ["fp32", "q8"],
    "briaai/RMBG-1.4": device === "webgpu" ? ["fp16", "q8", "fp32"] : ["q8", "fp32"],
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

/** Run face parsing on a square crop around the head for better accuracy, then paste back. */
async function parseWithCrop(seg: AnyPipe, img: RawImage, rgba: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
  type Seg = { label: string | null; mask: RawImage };
  const full = labelMapFromSegments((await seg(img)) as Seg[], w, h);
  // bbox of head classes
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = full[y * w + x];
    if (l >= 1 && l <= 14) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return full;
  const side = Math.round(Math.max(x1 - x0, y1 - y0) * 1.6);
  if (side * side > 0.6 * w * h || side < 32) return full;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sx = Math.max(0, Math.min(w - side, Math.round(cx - side / 2)));
  const sy = Math.max(0, Math.min(h - side, Math.round(cy - side / 2)));
  const cw = Math.min(side, w), ch = Math.min(side, h);
  const crop = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) crop.set(rgba.subarray(((sy + y) * w + sx) * 4, ((sy + y) * w + sx + cw) * 4), y * cw * 4);
  const cropLabels = labelMapFromSegments((await seg(new RawImage(crop, cw, ch, 4))) as Seg[], cw, ch);
  const out = full.slice();
  // inside the crop, use the crop result; outside keep the full-image result but drop head classes
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= sx && x < sx + cw && y >= sy && y < sy + ch;
    out[y * w + x] = inside ? cropLabels[(y - sy) * cw + (x - sx)] : full[y * w + x];
  }
  return out;
}

async function handleSegment(req: Extract<WorkerRequest, { type: "segment" }>) {
  const t0 = performance.now();
  const { w, h, rgba, id } = req;
  const device = await pickDevice(req.device);
  const warnings: string[] = [];
  const img = new RawImage(rgba, w, h, 4);
  let matte: Float32Array | null = null;
  let matteModel: string | null = null;
  if (req.matteEnabled) {
    for (const model of matteFallbackChain(req.matteModel)) {
      try {
        post({ type: "status", id, message: `Loading matte model ${model}` });
        const p = await loadPipe("background-removal", model, device, id, "matte");
        post({ type: "status", id, message: "Separating the person from the background" });
        const out = (await p(img)) as RawImage[];
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
      const seg = await loadPipe("image-segmentation", PARSING_MODEL_ID, device, id, "parsing");
      post({ type: "status", id, message: "Finding face, hair, ears and glasses" });
      labels = await parseWithCrop(seg, img, rgba, w, h);
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
