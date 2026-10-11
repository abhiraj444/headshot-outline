/**
 * Combine (§6.3): region = dilate(union(keep), region_dilate × H); alpha = matte × region.
 * Also applies tap-to-nudge hints (§12) — those are applied by the runner after the neck cut.
 */
import { boxBlur, dilate, toFloat } from "../core/mask";
import type { Params } from "../core/schema";
import { keptLabelIds, maskOf } from "./parsing";

export interface CombineInput {
  w: number;
  h: number;
  H: number;
  matte: Float32Array | null;
  labels: Uint8Array | null;
  /** used when parsing is disabled/failed: head-region estimate from the matte */
  headBoxRegion: Uint8Array | null;
}

export function combine(inp: CombineInput, p: Params): Float32Array {
  const { w, h, H } = inp;
  let region: Uint8Array | null = null;
  if (p.parsing.enabled && inp.labels) region = maskOf(inp.labels, keptLabelIds(p.parsing));
  else if (inp.headBoxRegion) region = inp.headBoxRegion;
  if (region) region = dilate(region, w, h, p.combine.region_dilate * H);

  const out = new Float32Array(w * h);
  if (p.matte.enabled && inp.matte) {
    // soft matte; hard threshold is applied only where needed (regionless case)
    const m = inp.matte;
    if (region) {
      // soften the region edge a little so the matte decides fine edges inside it
      const soft = boxBlur(toFloat(region), w, h, Math.max(1, Math.round(0.006 * H)));
      for (let i = 0; i < out.length; i++) out[i] = m[i] * Math.min(1, soft[i] * 1.5);
    } else {
      const t = p.matte.threshold;
      for (let i = 0; i < out.length; i++) out[i] = m[i] >= t ? m[i] : 0;
    }
  } else if (region) {
    const soft = boxBlur(toFloat(region), w, h, 1);
    out.set(soft);
  }
  // apply matte threshold as a soft re-centering so the 0.5 iso line follows `threshold`
  if (p.matte.enabled && inp.matte && Math.abs(p.matte.threshold - 0.5) > 1e-6) {
    const t = p.matte.threshold;
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      out[i] = v <= t ? (0.5 * v) / t : 0.5 + (0.5 * (v - t)) / (1 - t);
    }
  }
  return out;
}

export interface Nudge {
  /** working-image coordinates */
  x: number;
  y: number;
  /** radius as fraction of H */
  r: number;
  mode: "include" | "exclude";
}

/** Local mask edit: include → max(alpha, disk), exclude → alpha × (1 − disk). Soft-edged disks. */
export function applyNudges(alpha: Float32Array, w: number, h: number, H: number, nudges: Nudge[]): Float32Array {
  if (!nudges.length) return alpha;
  const out = alpha.slice();
  for (const n of nudges) {
    const r = Math.max(2, n.r * H);
    const x0 = Math.max(0, Math.floor(n.x - r - 2)), x1 = Math.min(w - 1, Math.ceil(n.x + r + 2));
    const y0 = Math.max(0, Math.floor(n.y - r - 2)), y1 = Math.min(h - 1, Math.ceil(n.y + r + 2));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - n.x, y + 0.5 - n.y);
      const k = Math.min(1, Math.max(0, (r + 1 - d) / 2)); // 2px soft edge
      if (k <= 0) continue;
      const i = y * w + x;
      out[i] = n.mode === "include" ? Math.max(out[i], k) : out[i] * (1 - k);
    }
  }
  return out;
}
