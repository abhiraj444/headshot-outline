/**
 * Head geometry: head axis (PCA, §4), head height H, chin point, pose estimate.
 */
import { estimateHeadAxis, project, projectPerp, type HeadAxis } from "../core/headaxis";
import { area, centroid, keepLargest, type Pt } from "../core/mask";
import { labelId, maskOf, maskOfNames } from "./parsing";

export type Pose = "front" | "three_quarter" | "profile";

export interface HeadGeom {
  axis: HeadAxis;
  H: number;
  /** projection (along axis) of the chin: the most chin-ward face point */
  chinProj: number;
  chinPoint: Pt;
  /** projection of top of hair */
  topProj: number;
  chinReliable: boolean;
  pose: Pose;
  /** 0..1 asymmetry indicator from parsing (nose offset relative to face width) */
  noseOffset: number;
  source: "parsing" | "matte";
  /** yaw estimate in degrees when landmarks are available */
  yawDeg?: number;
}

/** Fraction of H below the top of the hair used as neck-line anchor when the chin is unreliable (open decision §6.4). */
export const PROFILE_NECK_FRACTION = 0.9;

const FACE_LABELS = ["skin", "nose", "l_eye", "r_eye", "l_brow", "r_brow", "u_lip", "l_lip", "mouth", "eye_g"] as const;

export function geometryFromParsing(labels: Uint8Array, w: number, h: number): HeadGeom | null {
  const headIds = ["skin", "nose", "l_eye", "r_eye", "l_brow", "r_brow", "l_ear", "r_ear", "mouth", "u_lip", "l_lip", "hair", "eye_g"].map(labelId);
  const head = keepLargest(maskOf(labels, headIds), w, h);
  if (area(head) < 200) return null;
  const hair = maskOfNames(labels, ["hair"]);
  const face = maskOfNames(labels, [...FACE_LABELS]);
  const hairC = centroid(hair, w, h);
  const faceC = centroid(face, w, h);
  // upHint: from face toward hair, but only when hair sits above the face in the image
  let hint: Pt | null = null;
  if (hairC && faceC && hairC.y < faceC.y + 2) hint = hairC;
  const axis = estimateHeadAxis(head, w, h, hint ?? (faceC ? { x: faceC.x, y: faceC.y - 1000 } : null));
  if (!axis) return null;
  // chin = minimal projection among face pixels (excluding hair)
  let chinProj = Infinity, chinPoint: Pt = { x: axis.center.x, y: axis.center.y };
  let topProj = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!head[i]) continue;
    const p = project(axis, { x: x + 0.5, y: y + 0.5 });
    if (p > topProj) topProj = p;
    if (face[i] && p < chinProj) { chinProj = p; chinPoint = { x: x + 0.5, y: y + 0.5 }; }
  }
  const skinArea = area(maskOfNames(labels, ["skin"]));
  const lipsArea = area(maskOfNames(labels, ["u_lip", "l_lip", "mouth"]));
  const chinReliable = Number.isFinite(chinProj) && skinArea > 0.04 * area(head) && lipsArea > 0;
  if (!Number.isFinite(chinProj)) chinProj = topProj - PROFILE_NECK_FRACTION * axis.H;
  const H = Math.max(8, topProj - chinProj, axis.H * 0.6);
  // pose from eyes & nose offset
  const le = area(maskOfNames(labels, ["l_eye"]));
  const re = area(maskOfNames(labels, ["r_eye"]));
  const nose = centroid(maskOfNames(labels, ["nose"]), w, h);
  let noseOffset = 0;
  if (nose && faceC) {
    let minPp = Infinity, maxPp = -Infinity;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (face[y * w + x]) {
      const pp = projectPerp(axis, { x: x + 0.5, y: y + 0.5 });
      if (pp < minPp) minPp = pp; if (pp > maxPp) maxPp = pp;
    }
    const mid = (minPp + maxPp) / 2;
    noseOffset = Math.abs(projectPerp(axis, nose) - mid) / Math.max(1, maxPp - minPp);
  }
  const eyesBoth = le > 4 && re > 4;
  const eyeRatio = eyesBoth ? Math.min(le, re) / Math.max(le, re) : 0;
  let pose: Pose = "three_quarter";
  if (!eyesBoth || noseOffset > 0.3) pose = "profile";
  else if (eyeRatio > 0.55 && noseOffset < 0.12) pose = "front";
  return { axis, H, chinProj, chinPoint, topProj, chinReliable, pose, noseOffset, source: "parsing" };
}

/** Fallback geometry from the person matte: head ≈ top 1/7 of the person (§4). */
export function geometryFromMatte(person: Uint8Array, w: number, h: number): HeadGeom | null {
  const big = keepLargest(person, w, h);
  let y0 = -1, y1 = -1;
  for (let y = 0; y < h && y0 < 0; y++) for (let x = 0; x < w; x++) if (big[y * w + x]) { y0 = y; break; }
  for (let y = h - 1; y >= 0 && y1 < 0; y--) for (let x = 0; x < w; x++) if (big[y * w + x]) { y1 = y; break; }
  if (y0 < 0) return null;
  const personH = y1 - y0 + 1;
  // If the person is cut by the bottom border, the visible part is mostly head+shoulders.
  const touchesBottom = y1 >= h - 2;
  const headH = touchesBottom ? Math.min(personH * 0.55, personH) : personH / 7;
  const top = new Uint8Array(w * h);
  for (let y = y0; y < Math.min(h, y0 + headH); y++) for (let x = 0; x < w; x++) top[y * w + x] = big[y * w + x];
  const axis = estimateHeadAxis(top, w, h, null);
  if (!axis) return null;
  const topProj = axis.maxProj;
  const chinProj = topProj - headH;
  const chinPoint = { x: axis.center.x - axis.axis.x * (axis.center.y - (y0 + headH)), y: y0 + headH };
  return {
    axis, H: headH, chinProj, chinPoint, topProj, chinReliable: false, pose: "three_quarter", noseOffset: 0, source: "matte",
  };
}
