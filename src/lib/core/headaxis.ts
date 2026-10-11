import type { Pt } from "./mask";

export interface HeadAxis {
  /** Unit vector from chin toward top of hair (image coords, y down). */
  axis: Pt;
  /** Unit vector perpendicular to axis (axis rotated +90°). */
  perp: Pt;
  center: Pt;
  /** Head height H along the axis, in pixels. */
  H: number;
  /** min / max projection of the region onto the axis (relative to center). */
  minProj: number;
  maxProj: number;
}

/**
 * Estimate head axis via PCA of the head region (tech doc §4).
 * `upHint` is a point known to be toward the top of the head (e.g. hair centroid);
 * the axis is oriented to point toward it. Without a hint, the axis points up in the image.
 */
export function estimateHeadAxis(
  region: Uint8Array,
  w: number,
  h: number,
  upHint?: Pt | null,
): HeadAxis | null {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (region[y * w + x]) { n++; sx += x + 0.5; sy += y + 0.5; }
  if (n < 10) return null;
  const cx = sx / n, cy = sy / n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (region[y * w + x]) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
  }
  cxx /= n; cyy /= n; cxy /= n;
  // principal eigenvector of [[cxx,cxy],[cxy,cyy]]
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  let ax: number, ay: number;
  if (Math.abs(cxy) > 1e-9) { ax = l1 - cyy; ay = cxy; }
  else if (cxx >= cyy) { ax = 1; ay = 0; }
  else { ax = 0; ay = 1; }
  const len = Math.hypot(ax, ay) || 1;
  ax /= len; ay /= len;
  // Heads are roughly upright-ish: if the principal axis is closer to horizontal
  // than 60°, the region is wide (e.g. big hair) — fall back to vertical.
  if (Math.abs(ay) < 0.5) { ax = 0; ay = 1; }
  // orient toward the hint / image top
  let hx = upHint ? upHint.x - cx : 0;
  let hy = upHint ? upHint.y - cy : -1;
  if (Math.hypot(hx, hy) < 1) { hx = 0; hy = -1; }
  if (ax * hx + ay * hy < 0) { ax = -ax; ay = -ay; }
  let minP = Infinity, maxP = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (region[y * w + x]) {
    const p = (x + 0.5 - cx) * ax + (y + 0.5 - cy) * ay;
    if (p < minP) minP = p; if (p > maxP) maxP = p;
  }
  return {
    axis: { x: ax, y: ay },
    perp: { x: -ay, y: ax },
    center: { x: cx, y: cy },
    H: Math.max(1, maxP - minP),
    minProj: minP,
    maxProj: maxP,
  };
}

export function project(a: HeadAxis, p: Pt): number {
  return (p.x - a.center.x) * a.axis.x + (p.y - a.center.y) * a.axis.y;
}
export function projectPerp(a: HeadAxis, p: Pt): number {
  return (p.x - a.center.x) * a.perp.x + (p.y - a.center.y) * a.perp.y;
}
