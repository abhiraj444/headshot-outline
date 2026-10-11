import type { MatteModel, Params } from "../core/schema";
import type { Nudge } from "../pipeline/combine";
import type { LandmarkLines } from "../pipeline/features";
import type { RunOutput } from "../pipeline/run";

export type DevicePref = "auto" | "webgpu" | "wasm";

export type WorkerRequest =
  | {
      type: "segment";
      id: number;
      imageId: string;
      w: number;
      h: number;
      rgba: Uint8ClampedArray;
      matteModel: MatteModel;
      matteEnabled: boolean;
      parsingEnabled: boolean;
      device: DevicePref;
    }
  | { type: "run"; id: number; params: Params; nudges: Nudge[]; landmarks: LandmarkLines | null };

export interface SegmentResult {
  device: "webgpu" | "wasm";
  matteModel: string | null;
  parsingOk: boolean;
  matteOk: boolean;
  noPerson: boolean;
  labelsPresent: string[];
  warnings: string[];
  ms: number;
}

export type WorkerResponse =
  | { type: "progress"; id: number; stage: "matte" | "parsing"; file?: string; progress: number; status: string }
  | { type: "status"; id: number; message: string }
  | { type: "segmented"; id: number; result: SegmentResult }
  | { type: "ran"; id: number; result: RunOutput }
  | { type: "error"; id: number; message: string; oom?: boolean };
