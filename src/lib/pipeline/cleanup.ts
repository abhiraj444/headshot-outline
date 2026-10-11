/**
 * Cleanup (§6.5): keep largest component, morphological close + hole fill,
 * guided-filter edge refinement, optional foreground colour decontamination
 * (preview only — never affects the outline).
 */
import { binarize, boxBlur, close, fillHoles, guidedFilter, keepLargest } from "../core/mask";
import type { Params } from "../core/schema";

export function cleanup(alpha: Float32Array, gray: Float32Array, w: number, h: number, H: number, p: Params["cleanup"]): Float32Array {
  const out = alpha.slice();
  let hard = binarize(out, 0.5);
  if (p.keep_largest) {
    const big = keepLargest(hard, w, h);
    for (let i = 0; i < out.length; i++) if (!big[i]) out[i] = Math.min(out[i], 0.49 * (hard[i] ? 0 : 1) * out[i]);
    hard = big;
  }
  if (p.fill_holes) {
    const closed = close(hard, w, h, p.close_radius * H);
    const filled = fillHoles(closed, w, h);
    for (let i = 0; i < out.length; i++) if (filled[i] && !hard[i]) out[i] = Math.max(out[i], filled[i] && closed[i] ? 1 : 0.75);
    hard = filled;
  }
  const r = Math.round(p.guided_filter_radius * H);
  if (r >= 1) {
    const refined = guidedFilter(gray, out, w, h, r, 1e-3);
    // keep topology from the hard mask: only refine within a band around the edge
    const band = boxBlur(hard, w, h, r);
    for (let i = 0; i < out.length; i++) if (band[i] > 0.02 && band[i] < 0.98) out[i] = refined[i];
    if (p.keep_largest) {
      const big = keepLargest(binarize(out, 0.5), w, h);
      for (let i = 0; i < out.length; i++) if (!big[i] && out[i] >= 0.5) out[i] = 0.49;
    }
  }
  return out;
}

/**
 * Foreground colour estimate near edges (normalised convolution of colour × alpha).
 * Returns an RGBA cut-out for the preview.
 */
export function decontaminate(rgba: Uint8ClampedArray, alpha: Float32Array, w: number, h: number, H: number, enabled: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const r = Math.max(2, Math.round(0.01 * H));
  let fr: Float32Array | null = null, fg: Float32Array | null = null, fb: Float32Array | null = null, fa: Float32Array | null = null;
  if (enabled) {
    const sure = new Float32Array(w * h);
    for (let i = 0; i < sure.length; i++) sure[i] = alpha[i] > 0.9 ? 1 : 0;
    const cr = new Float32Array(w * h), cg = new Float32Array(w * h), cb = new Float32Array(w * h);
    for (let i = 0; i < sure.length; i++) { cr[i] = rgba[i * 4] * sure[i]; cg[i] = rgba[i * 4 + 1] * sure[i]; cb[i] = rgba[i * 4 + 2] * sure[i]; }
    fr = boxBlur(cr, w, h, r); fg = boxBlur(cg, w, h, r); fb = boxBlur(cb, w, h, r); fa = boxBlur(sure, w, h, r);
  }
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i];
    let R = rgba[i * 4], G = rgba[i * 4 + 1], B = rgba[i * 4 + 2];
    if (enabled && a > 0.02 && a < 0.9 && fa![i] > 0.05) { R = fr![i] / fa![i]; G = fg![i] / fa![i]; B = fb![i] / fa![i]; }
    out[i * 4] = R; out[i * 4 + 1] = G; out[i * 4 + 2] = B; out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}
