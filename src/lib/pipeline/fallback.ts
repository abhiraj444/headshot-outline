/**
 * No-ML fallback (§6.7): "GrabCut-lite".
 * Rectangle around the estimated head; skin-coloured pixels (YCrCb) inside the
 * rectangle seed definite foreground, the image border seeds definite background.
 * Colour models are 3-D histograms (16³ bins); labels are refined iteratively with
 * a box-filter smoothness prior (a cheap stand-in for the graph cut). Expect weaker hair.
 */
import { boxBlur, keepLargest, fillHoles } from "../core/mask";

export interface Rect { x0: number; y0: number; x1: number; y1: number }

export function isSkinYCrCb(r: number, g: number, b: number): boolean {
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  return cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127;
}

/** Find a head rectangle from skin pixels when nothing else is known. */
export function skinRect(rgba: ArrayLike<number>, w: number, h: number): Rect | null {
  const skin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) skin[i] = isSkinYCrCb(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) ? 1 : 0;
  const big = keepLargest(skin, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (big[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0 || (x1 - x0) * (y1 - y0) < 0.002 * w * h) return null;
  const bw = x1 - x0, bh = y1 - y0;
  return {
    x0: Math.max(0, Math.round(x0 - 0.35 * bw)),
    x1: Math.min(w - 1, Math.round(x1 + 0.35 * bw)),
    y0: Math.max(0, Math.round(y0 - 0.6 * bh)),
    y1: Math.min(h - 1, Math.round(y1 + 0.1 * bh)),
  };
}

const BINS = 16;
const binOf = (r: number, g: number, b: number) => ((r >> 4) * BINS + (g >> 4)) * BINS + (b >> 4);

export function grabCutLite(rgba: ArrayLike<number>, w: number, h: number, rect: Rect, iterations = 4): Float32Array {
  const n = w * h;
  // 1 = fg, 0 = bg; seeds fixed
  const label = new Uint8Array(n);
  const fixed = new Int8Array(n); // 1 fg, -1 bg, 0 free
  const bins = new Uint16Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    bins[i] = binOf(r, g, b);
    const inside = x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
    if (!inside || x < 2 || y < 2 || x >= w - 2 || y >= h - 2) { fixed[i] = -1; label[i] = 0; continue; }
    label[i] = 1;
    if (isSkinYCrCb(r, g, b)) fixed[i] = 1;
  }
  const NB = BINS * BINS * BINS;
  for (let it = 0; it < iterations; it++) {
    const fgH = new Float32Array(NB).fill(1), bgH = new Float32Array(NB).fill(1);
    let fgN = NB, bgN = NB;
    for (let i = 0; i < n; i++) { if (label[i]) { fgH[bins[i]]++; fgN++; } else { bgH[bins[i]]++; bgN++; } }
    const score = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pf = fgH[bins[i]] / fgN, pb = bgH[bins[i]] / bgN;
      score[i] = pf / (pf + pb);
    }
    const smooth = boxBlur(score, w, h, Math.max(2, Math.round(Math.min(w, h) / 150)));
    for (let i = 0; i < n; i++) {
      if (fixed[i] === 1) label[i] = 1;
      else if (fixed[i] === -1) label[i] = 0;
      else label[i] = smooth[i] > 0.5 ? 1 : 0;
    }
  }
  const filled = fillHoles(keepLargest(label, w, h), w, h);
  return boxBlur(filled, w, h, 1);
}
