"use client";
import type { Params } from "../core/schema";
import type { Nudge } from "../pipeline/combine";
import type { LandmarkLines } from "../pipeline/features";
import type { RunOutput } from "../pipeline/run";
import type { DevicePref, SegmentResult, WorkerRequest, WorkerResponse } from "./protocol";

export type ProgressEvent = Extract<WorkerResponse, { type: "progress" }> | Extract<WorkerResponse, { type: "status" }>;

export class WorkerError extends Error {
  constructor(message: string, public oom = false) {
    super(message);
  }
}

/** Promise wrapper around the inference worker. */
export class InferenceClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  onProgress: ((e: ProgressEvent) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./inference.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === "progress" || m.type === "status") {
        this.onProgress?.(m);
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === "error") p.reject(new WorkerError(m.message, m.oom));
      else if (m.type === "segmented") p.resolve(m.result);
      else if (m.type === "ran") p.resolve(m.result);
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new WorkerError(e.message || "Worker crashed"));
      this.pending.clear();
    };
  }

  private call<T>(req: Omit<WorkerRequest, "id"> & { type: WorkerRequest["type"] }, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }

  segment(args: {
    imageId: string; w: number; h: number; rgba: Uint8ClampedArray;
    matteModel: Params["matte"]["model"]; matteEnabled: boolean; parsingEnabled: boolean; device: DevicePref;
  }): Promise<SegmentResult> {
    const rgba = args.rgba.slice();
    return this.call<SegmentResult>({ type: "segment", ...args, rgba } as WorkerRequest, [rgba.buffer]);
  }

  run(params: Params, nudges: Nudge[], landmarks: LandmarkLines | null): Promise<RunOutput> {
    return this.call<RunOutput>({ type: "run", params, nudges, landmarks } as WorkerRequest);
  }

  terminate() {
    this.worker.terminate();
  }
}
