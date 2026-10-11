"use client";
/**
 * Optional refinement: MediaPipe Face Landmarker (478 landmarks) sharpens eye, brow,
 * lip and nose lines when a face is found and |yaw| < 50°. Runs on the main thread
 * (MediaPipe's WASM loader is not module-worker friendly); it is fast (~20–60 ms).
 * Profiles fall back to parsing-only lines.
 */
import type { Pt } from "../core/mask";
import type { LandmarkLines } from "./features";

const TASKS_VERSION = "1.1.0"; // keep in sync with package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Conn = { start: number; end: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let landmarkerPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FL: any = null;

async function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        FL = vision.FaceLandmarker;
        const files = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        const make = (delegate: "GPU" | "CPU") =>
          vision.FaceLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: "IMAGE",
            numFaces: 1,
          });
        try {
          return await make("CPU");
        } catch {
          return await make("GPU");
        }
      } catch {
        return null;
      }
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}

/** Chain unordered connection pairs into polylines of landmark indices. */
export function chainConnections(conns: Conn[]): number[][] {
  const adj = new Map<number, number[]>();
  for (const { start, end } of conns) {
    adj.set(start, [...(adj.get(start) ?? []), end]);
    adj.set(end, [...(adj.get(end) ?? []), start]);
  }
  const usedEdge = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const chains: number[][] = [];
  const starts = [...adj.keys()].sort((a, b) => (adj.get(a)!.length % 2 ? -1 : 0) - (adj.get(b)!.length % 2 ? -1 : 0));
  for (const s of starts) {
    for (const n of adj.get(s)!) {
      if (usedEdge.has(key(s, n))) continue;
      const chain = [s];
      let prev = s, cur = n;
      usedEdge.add(key(s, n));
      for (;;) {
        chain.push(cur);
        const nxt = (adj.get(cur) ?? []).find((x) => x !== prev && !usedEdge.has(key(cur, x)));
        if (nxt === undefined) break;
        usedEdge.add(key(cur, nxt));
        prev = cur;
        cur = nxt;
      }
      chains.push(chain);
    }
  }
  return chains;
}

// nostril / nose-base line (MediaPipe canonical mesh indices)
const NOSE_BASE = [129, 98, 97, 2, 326, 327, 358];
const NOSE_TIP = 1, LEFT_CHEEK = 234, RIGHT_CHEEK = 454;

export function yawFromLandmarks(lm: { x: number; y: number }[]): number {
  const l = lm[LEFT_CHEEK], r = lm[RIGHT_CHEEK], n = lm[NOSE_TIP];
  const span = r.x - l.x;
  if (Math.abs(span) < 1e-6) return 90;
  const t = (n.x - l.x) / span; // 0.5 = frontal
  return (Math.asin(Math.max(-1, Math.min(1, (t - 0.5) * 2))) * 180) / Math.PI;
}

export async function detectLandmarkLines(canvas: HTMLCanvasElement): Promise<LandmarkLines | null> {
  const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  const detectPromise = (async (): Promise<LandmarkLines | null> => {
    try {
      const lmk = await getLandmarker();
      if (!lmk || !FL) return null;
      const res = lmk.detect(canvas) as { faceLandmarks: { x: number; y: number }[][] };
      const lm = res?.faceLandmarks?.[0];
      if (!lm || lm.length < 468) return null;
      const w = canvas.width, h = canvas.height;
      const toPts = (idx: number[]): Pt[] => idx.map((i) => ({ x: lm[i].x * w, y: lm[i].y * h }));
      const lines = (conns: Conn[]) => chainConnections(conns).map(toPts);
      const lips = chainConnections(FL.FACE_LANDMARKS_LIPS as Conn[]).map(toPts);
      // the outer lip loop is the one with the larger extent
      const extent = (p: Pt[]) => Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x));
      const sorted = lips.sort((a, b) => extent(b) - extent(a));
      const half = Math.ceil(sorted.length / 2);
      return {
        yawDeg: yawFromLandmarks(lm),
        eyes: [...lines(FL.FACE_LANDMARKS_LEFT_EYE), ...lines(FL.FACE_LANDMARKS_RIGHT_EYE)],
        brows: [...lines(FL.FACE_LANDMARKS_LEFT_EYEBROW), ...lines(FL.FACE_LANDMARKS_RIGHT_EYEBROW)],
        lipsOuter: sorted.slice(0, half),
        lipsInner: sorted.slice(half),
        nose: [toPts(NOSE_BASE)],
        iris: lm.length >= 478 ? [...lines(FL.FACE_LANDMARKS_LEFT_IRIS), ...lines(FL.FACE_LANDMARKS_RIGHT_IRIS)] : [],
      };
    } catch {
      return null;
    }
  })();
  return Promise.race([detectPromise, timeoutPromise]);
}
