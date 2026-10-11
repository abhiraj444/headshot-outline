/**
 * Features stage (scope extension, runs after Cleanup):
 * internal facial line art traced from the face-parsing label map —
 * brows, eyes, glasses (frame + lenses), nose (lower contour / profile edge),
 * lips (+ mouth line), ears (+ inner curve), hairline, jaw, beard edge —
 * smoothed (Chaikin), simplified (Douglas–Peucker) and clipped inside the head mask.
 * Optional MediaPipe landmark lines replace eyes/brows/lips/nose when yaw < ~50°.
 */
import { project, projectPerp } from "../core/headaxis";
import { area, centroid, dilate, erode, removeSmall, type Pt } from "../core/mask";
import type { FeatureKey, Params } from "../core/schema";
import type { HeadGeom } from "./geometry";
import { douglasPeucker, marchingSquares, signedArea, simplifyClosed, smoothPolyline, type Polyline } from "./outline";
import { labelId, maskOfNames, type CelebaLabel } from "./parsing";

export interface FeatureGroup {
  key: FeatureKey | "iris";
  part: string;
  polylines: Polyline[];
  source: "parsing" | "landmarks";
}

export interface FeatureStats {
  present: Partial<Record<FeatureKey, boolean>>;
  expected: FeatureKey[];
  /** fraction of feature points that fell outside the head mask before clipping */
  outsideFraction: number;
  symmetry: number | null;
  usedLandmarks: boolean;
}

export interface LandmarkLines {
  yawDeg: number;
  eyes?: Pt[][];
  brows?: Pt[][];
  lipsOuter?: Pt[][];
  lipsInner?: Pt[][];
  nose?: Pt[][];
  iris?: Pt[][];
}

export const LANDMARK_MAX_YAW = 50;

interface Ctx {
  w: number;
  h: number;
  labels: Uint8Array;
  head: Uint8Array; // hard head mask (alpha ≥ 0.5, slightly dilated)
  geom: HeadGeom;
  minArea: number;
  smoothing: number;
  eps: number;
  outsideCount: number;
  totalCount: number;
}

function sample(m: Uint8Array, w: number, h: number, p: Pt): number {
  const x = Math.min(w - 1, Math.max(0, Math.floor(p.x)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(p.y)));
  return m[y * w + x];
}

/** Split a polyline into runs where `keep` holds (closed loops rotate to a gap first). */
export function keepRuns(points: Pt[], closed: boolean, keep: (p: Pt) => boolean, minPts = 3): Polyline[] {
  const n = points.length;
  const flags = points.map(keep);
  if (flags.every(Boolean)) return [{ points, closed }];
  const out: Polyline[] = [];
  let start = 0;
  if (closed) {
    start = flags.indexOf(false);
    if (start < 0) return [{ points, closed }];
  }
  let run: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const i = closed ? (start + k) % n : k;
    if (flags[i]) run.push(points[i]);
    else if (run.length) { if (run.length >= minPts) out.push({ points: run, closed: false }); run = []; }
  }
  if (run.length >= minPts) out.push({ points: run, closed: false });
  return out;
}

function finish(ctx: Ctx, pl: Polyline): Polyline[] {
  const sm = smoothPolyline(pl.points, pl.closed, ctx.smoothing);
  const simp = pl.closed ? simplifyClosed(sm, ctx.eps) : douglasPeucker(sm, ctx.eps);
  // clip inside head mask
  ctx.totalCount += simp.length;
  const runs = keepRuns(simp, pl.closed, (p) => {
    const inside = sample(ctx.head, ctx.w, ctx.h, p) === 1;
    if (!inside) ctx.outsideCount++;
    return inside;
  }, 2);
  return runs.filter((r) => r.points.length >= 2);
}

function loopsOf(ctx: Ctx, m: Uint8Array, withHoles: boolean): Polyline[] {
  const clean = removeSmall(m, ctx.w, ctx.h, ctx.minArea);
  if (!area(clean)) return [];
  const loops = marchingSquares(clean, ctx.w, ctx.h, 0.5);
  return loops
    .filter((l) => (withHoles ? true : signedArea(l) > 0) && Math.abs(signedArea(l)) >= ctx.minArea * 0.25)
    .map((points) => ({ points, closed: true }));
}

function traceLabels(ctx: Ctx, names: CelebaLabel[], withHoles = false): Polyline[] {
  return loopsOf(ctx, maskOfNames(ctx.labels, names), withHoles).flatMap((pl) => finish(ctx, pl));
}

/** Boundary of A that touches B (within ~2px). Open polylines. */
function boundaryBetween(ctx: Ctx, a: Uint8Array, b: Uint8Array, minLenPts = 4): Polyline[] {
  const bNear = dilate(b, ctx.w, ctx.h, 2.5);
  return loopsOf(ctx, a, false)
    .flatMap((pl) => keepRuns(pl.points, true, (p) => sample(bNear, ctx.w, ctx.h, p) === 1, minLenPts))
    .flatMap((pl) => finish(ctx, pl));
}

function present(groups: FeatureGroup[], key: FeatureKey) {
  return groups.some((g) => g.key === key && g.polylines.length > 0);
}

export function expectedFeatures(pose: HeadGeom["pose"]): FeatureKey[] {
  if (pose === "profile") return ["eyes", "nose", "lips"];
  return ["brows", "eyes", "nose", "lips"];
}

export function extractFeatures(
  input: { w: number; h: number; labels: Uint8Array | null; alpha: Float32Array; geom: HeadGeom | null; landmarks?: LandmarkLines | null },
  params: Params,
): { groups: FeatureGroup[]; stats: FeatureStats } {
  const f = params.features;
  const empty: FeatureStats = { present: {}, expected: [], outsideFraction: 0, symmetry: null, usedLandmarks: false };
  if (!f.enabled || f.detail === "outline_only" || !input.geom) return { groups: [], stats: empty };
  const { w, h, geom } = input;
  const H = geom.H;
  const headHard = new Uint8Array(w * h);
  for (let i = 0; i < headHard.length; i++) headHard[i] = input.alpha[i] >= 0.5 ? 1 : 0;
  const ctx: Ctx = {
    w, h,
    labels: input.labels ?? new Uint8Array(w * h).fill(labelId("background")),
    head: dilate(headHard, w, h, 1.5),
    geom,
    minArea: Math.max(6, f.min_area * H * H),
    smoothing: f.smoothing,
    eps: Math.max(0.3, params.outline.simplify_epsilon * H * 0.5),
    outsideCount: 0,
    totalCount: 0,
  };
  const detail = f.detail;
  const inc = (k: FeatureKey) => f.include[k];
  const minimal = detail === "minimal";
  const detailed = detail === "detailed";
  const groups: FeatureGroup[] = [];
  const lm = input.landmarks && Math.abs(input.landmarks.yawDeg) < LANDMARK_MAX_YAW ? input.landmarks : null;
  const fromLm = (pts: Pt[][] | undefined, closed: boolean): Polyline[] =>
    (pts ?? []).filter((p) => p.length >= 2).flatMap((points) => finish({ ...ctx, smoothing: Math.min(ctx.smoothing, 0.3) }, { points, closed }));
  const push = (key: FeatureGroup["key"], part: string, polylines: Polyline[], source: FeatureGroup["source"] = "parsing") => {
    if (polylines.length) groups.push({ key, part, polylines, source });
  };

  if (input.labels) {
    // Brows
    if (inc("brows")) {
      if (lm?.brows?.length) push("brows", "brows", fromLm(lm.brows, true), "landmarks");
      else push("brows", "brows", traceLabels(ctx, ["l_brow"]).concat(traceLabels(ctx, ["r_brow"])));
    }
    // Eyes
    if (inc("eyes")) {
      if (lm?.eyes?.length) push("eyes", "eyes", fromLm(lm.eyes, true), "landmarks");
      else push("eyes", "eyes", traceLabels(ctx, ["l_eye"]).concat(traceLabels(ctx, ["r_eye"])));
      if (detailed && lm?.iris?.length) push("iris", "iris", fromLm(lm.iris, true), "landmarks");
    }
    // Glasses: outer frame + lens shapes (holes)
    if (inc("glasses") && !minimal) push("glasses", "frame", traceLabels(ctx, ["eye_g"], true));
    // Nose: lower contour / nostril line; side edge in profile
    if (inc("nose")) {
      if (lm?.nose?.length && geom.pose !== "profile") push("nose", "nostrils", fromLm(lm.nose, false), "landmarks");
      else {
        const nose = maskOfNames(ctx.labels, ["nose"]);
        let minP = Infinity, maxP = -Infinity;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (nose[y * w + x]) {
          const p = project(geom.axis, { x: x + 0.5, y: y + 0.5 });
          if (p < minP) minP = p; if (p > maxP) maxP = p;
        }
        if (Number.isFinite(minP)) {
          const cutoff = minP + (minimal ? 0.35 : 0.45) * (maxP - minP);
          const outside = new Uint8Array(w * h);
          for (let i = 0; i < outside.length; i++) outside[i] = headHard[i] ? 0 : 1;
          const outsideNear = dilate(outside, w, h, 2.5);
          const keep = (p: Pt) =>
            project(geom.axis, p) <= cutoff || (geom.pose === "profile" && sample(outsideNear, w, h, p) === 1);
          const lines = loopsOf(ctx, nose, false)
            .flatMap((pl) => keepRuns(pl.points, true, keep, 3))
            .flatMap((pl) => finish(ctx, pl));
          push("nose", geom.pose === "profile" ? "lower + side edge" : "lower contour", lines);
        }
      }
    }
    // Lips + mouth line
    if (inc("lips")) {
      const mouthLine = (): Polyline[] => {
        if (lm?.lipsInner?.length) return fromLm(lm.lipsInner, true);
        return boundaryBetween(ctx, maskOfNames(ctx.labels, ["u_lip"]), maskOfNames(ctx.labels, ["l_lip", "mouth"]));
      };
      if (!minimal) {
        if (lm?.lipsOuter?.length) push("lips", "lips", fromLm(lm.lipsOuter, true), "landmarks");
        else push("lips", "lips", traceLabels(ctx, ["u_lip"]).concat(traceLabels(ctx, ["l_lip"])));
      }
      push("lips", "mouth line", mouthLine(), lm?.lipsInner?.length ? "landmarks" : "parsing");
    }
    if (!minimal) {
      // Ears (+ inner curve in detailed)
      if (inc("ears")) {
        for (const name of ["l_ear", "r_ear"] as CelebaLabel[]) {
          const ear = removeSmall(maskOfNames(ctx.labels, [name]), w, h, ctx.minArea);
          const a = area(ear);
          if (!a) continue;
          push("ears", `${name} outer`, loopsOf(ctx, ear, false).flatMap((pl) => finish(ctx, pl)));
          if (detailed) {
            const r = 0.3 * Math.sqrt(a / Math.PI);
            const inner = erode(ear, w, h, r);
            const earC = centroid(ear, w, h);
            const faceC = centroid(maskOfNames(ctx.labels, ["skin"]), w, h);
            if (earC && faceC) {
              const d0 = Math.hypot(earC.x - faceC.x, earC.y - faceC.y);
              const lines = loopsOf({ ...ctx, minArea: Math.max(4, ctx.minArea * 0.2) }, inner, false)
                .flatMap((pl) => keepRuns(pl.points, true, (p) => Math.hypot(p.x - faceC.x, p.y - faceC.y) >= d0, 3))
                .flatMap((pl) => finish(ctx, pl));
              push("ears", `${name} inner`, lines);
            }
          }
        }
      }
      // Hairline: skin ↔ hair
      if (inc("hairline")) {
        push("hairline", "hairline", boundaryBetween(ctx, maskOfNames(ctx.labels, ["skin"]), maskOfNames(ctx.labels, ["hair"]), 6));
      }
      // Jaw / chin: skin ↔ neck
      if (inc("jaw")) {
        push("jaw", "jawline", boundaryBetween(ctx, maskOfNames(ctx.labels, ["skin"]), maskOfNames(ctx.labels, ["neck", "neck_l"]), 6));
      }
      // Beard: hair below the nose, edge against skin/lips
      if (inc("beard")) {
        const hair = maskOfNames(ctx.labels, ["hair"]);
        const nose = centroid(maskOfNames(ctx.labels, ["nose"]), w, h);
        const limit = nose ? project(geom.axis, nose) : geom.chinProj + 0.35 * H;
        const beard = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (hair[i] && project(geom.axis, { x: x + 0.5, y: y + 0.5 }) < limit) beard[i] = 1;
        }
        if (area(beard) >= ctx.minArea) {
          push("beard", "beard edge", boundaryBetween(ctx, beard, maskOfNames(ctx.labels, ["skin", "u_lip", "l_lip", "mouth"]), 6));
        }
      }
    }
  } else if (lm) {
    // No parsing: landmark-only lines
    if (inc("brows")) push("brows", "brows", fromLm(lm.brows, true), "landmarks");
    if (inc("eyes")) push("eyes", "eyes", fromLm(lm.eyes, true), "landmarks");
    if (inc("nose")) push("nose", "nostrils", fromLm(lm.nose, false), "landmarks");
    if (inc("lips")) {
      if (!minimal) push("lips", "lips", fromLm(lm.lipsOuter, true), "landmarks");
      push("lips", "mouth line", fromLm(lm.lipsInner, true), "landmarks");
    }
  }

  // stats
  const expected = expectedFeatures(geom.pose).filter((k) => inc(k));
  const pres: Partial<Record<FeatureKey, boolean>> = {};
  for (const k of ["brows", "eyes", "glasses", "nose", "lips", "ears", "hairline", "jaw", "beard"] as FeatureKey[]) pres[k] = present(groups, k);
  let symmetry: number | null = null;
  if (geom.pose === "front" && input.labels) {
    const le = centroid(maskOfNames(ctx.labels, ["l_eye"]), w, h);
    const re = centroid(maskOfNames(ctx.labels, ["r_eye"]), w, h);
    const skin = maskOfNames(ctx.labels, ["skin"]);
    if (le && re) {
      let minPp = Infinity, maxPp = -Infinity;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (skin[y * w + x]) {
        const pp = projectPerp(geom.axis, { x, y });
        if (pp < minPp) minPp = pp; if (pp > maxPp) maxPp = pp;
      }
      const mid = (minPp + maxPp) / 2;
      const d = Math.max(1, Math.hypot(le.x - re.x, le.y - re.y));
      const horiz = Math.abs(projectPerp(geom.axis, le) + projectPerp(geom.axis, re) - 2 * mid) / d;
      const vert = Math.abs(project(geom.axis, le) - project(geom.axis, re)) / d;
      symmetry = Math.max(0, 1 - (horiz + vert));
    }
  }
  return {
    groups,
    stats: {
      present: pres,
      expected,
      outsideFraction: ctx.totalCount ? ctx.outsideCount / ctx.totalCount : 0,
      symmetry,
      usedLandmarks: !!lm,
    },
  };
}
