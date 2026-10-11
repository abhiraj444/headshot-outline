/**
 * Neck cut (§6.4): a line perpendicular to the head axis just below the chin,
 * shifted by offset × H (positive = toward the neck) and rotated by angle_deg,
 * multiplied in as a soft step with width feather × H. When the chin is
 * unreliable (profiles), the line is anchored PROFILE_NECK_FRACTION × H below the hair top.
 */
import type { Params } from "../core/schema";
import { PROFILE_NECK_FRACTION, type HeadGeom } from "./geometry";
import type { Pt } from "../core/mask";

export interface NeckLine {
  point: Pt;
  /** unit normal pointing toward the head (kept side) */
  normal: Pt;
  /** projection along head axis of the line anchor */
  proj: number;
}

export function neckLine(g: HeadGeom, p: Params["neck_cut"]): NeckLine {
  const { axis } = g;
  const baseProj = g.chinReliable ? g.chinProj : g.topProj - PROFILE_NECK_FRACTION * g.H;
  const proj = baseProj - p.offset * g.H; // positive offset moves the cut down (toward the neck)
  const point = { x: axis.center.x + axis.axis.x * proj, y: axis.center.y + axis.axis.y * proj };
  const a = (p.angle_deg * Math.PI) / 180;
  const nx = axis.axis.x * Math.cos(a) - axis.axis.y * Math.sin(a);
  const ny = axis.axis.x * Math.sin(a) + axis.axis.y * Math.cos(a);
  return { point, normal: { x: nx, y: ny }, proj };
}

export function applyNeckCut(alpha: Float32Array, w: number, h: number, g: HeadGeom, p: Params["neck_cut"]): { alpha: Float32Array; line: NeckLine | null } {
  if (!p.enabled) return { alpha, line: null };
  const line = neckLine(g, p);
  const width = Math.max(1, p.feather * g.H);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!alpha[i]) continue;
    const d = (x + 0.5 - line.point.x) * line.normal.x + (y + 0.5 - line.point.y) * line.normal.y;
    const t = Math.min(1, Math.max(0, 0.5 + d / width));
    const s = t * t * (3 - 2 * t); // smoothstep
    out[i] = alpha[i] * s;
  }
  return { alpha: out, line };
}
