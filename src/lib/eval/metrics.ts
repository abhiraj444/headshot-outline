/**
 * Evaluator (§7) + feature metrics (scope extension).
 * Thresholds are starting values to be tuned on the test set.
 */
import { project, type HeadAxis } from "../core/headaxis";
import { area, binarize, boundaryPoints, components, convexHull, polygonArea, type Pt } from "../core/mask";
import type { FeatureStats } from "../pipeline/features";
import type { Polyline } from "../pipeline/outline";

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  /** null = informational / not applicable */
  pass: boolean | null;
  expected: string;
  weight: number;
}

export const THRESHOLDS = {
  solidity: [0.8, 0.98],
  head_area_ratio: [0.08, 0.45],
  edge_agreement_floor: 1.2,
  neck_position: [-0.05, 0.15],
  features_present_min: 0.75,
  symmetry_min: 0.75,
  features_outside_max: 0.05,
} as const;

export interface EvalInput {
  w: number;
  h: number;
  alpha: Float32Array;
  personMatte: Float32Array | null;
  matteThreshold: number;
  gradient: Float32Array;
  gradientMean: number;
  outline: Polyline[];
  axis: HeadAxis | null;
  H: number;
  chinProj: number | null;
  featuresEnabled: boolean;
  featureStats: FeatureStats | null;
}

export function evaluate(e: EvalInput): Metric[] {
  const { w, h } = e;
  const hard = binarize(e.alpha, 0.5);
  const maskArea = area(hard);
  const { sizes } = components(hard, w, h);
  const comps = sizes.length - 1;
  const metrics: Metric[] = [];
  metrics.push({ key: "components", label: "Connected regions", value: comps, pass: comps === 1, expected: "= 1", weight: 1 });

  const bpts = boundaryPoints(hard, w, h);
  const hull = convexHull(bpts.length > 4000 ? bpts.filter((_, i) => i % Math.ceil(bpts.length / 4000) === 0) : bpts);
  const hullA = polygonArea(hull);
  const solidity = hullA > 0 ? Math.min(1, maskArea / hullA) : 0;
  metrics.push({
    key: "solidity", label: "Solidity", value: solidity,
    pass: solidity >= THRESHOLDS.solidity[0] && solidity <= THRESHOLDS.solidity[1], expected: "0.80 – 0.98", weight: 1,
  });

  if (e.personMatte) {
    const personA = area(e.personMatte, e.matteThreshold);
    const ratio = personA > 0 ? maskArea / personA : 0;
    metrics.push({
      key: "head_area_ratio", label: "Head / person area", value: ratio,
      pass: ratio >= THRESHOLDS.head_area_ratio[0] && ratio <= THRESHOLDS.head_area_ratio[1], expected: "0.08 – 0.45", weight: 1,
    });
  } else {
    metrics.push({ key: "head_area_ratio", label: "Head / person area", value: null, pass: null, expected: "needs matte", weight: 1 });
  }

  // edge agreement: mean gradient along contour / image mean gradient
  let gs = 0, gn = 0, borderPts = 0, allPts = 0;
  for (const pl of e.outline) {
    const pts = densify(pl.points, pl.closed, 2);
    for (const p of pts) {
      allPts++;
      const x = Math.min(w - 1, Math.max(0, Math.round(p.x - 0.5)));
      const y = Math.min(h - 1, Math.max(0, Math.round(p.y - 0.5)));
      if (p.x <= 1 || p.y <= 1 || p.x >= w - 1 || p.y >= h - 1) { borderPts++; continue; }
      // max in 3x3 to allow 1px misplacement
      let g = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) g = Math.max(g, e.gradient[yy * w + xx]);
      }
      gs += g; gn++;
    }
  }
  const edge = gn && e.gradientMean > 0 ? gs / gn / e.gradientMean : 0;
  metrics.push({
    key: "edge_agreement", label: "Edge agreement", value: edge,
    pass: edge >= THRESHOLDS.edge_agreement_floor, expected: `≥ ${THRESHOLDS.edge_agreement_floor}`, weight: 1,
  });

  // neck position: (chin − lowest mask point along axis) / H
  if (e.axis && e.chinProj !== null && maskArea) {
    let low = Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hard[y * w + x]) {
      const p = project(e.axis, { x: x + 0.5, y: y + 0.5 });
      if (p < low) low = p;
    }
    const np = (e.chinProj - low) / e.H;
    metrics.push({
      key: "neck_position", label: "Neck cut below chin (×H)", value: np,
      pass: np >= THRESHOLDS.neck_position[0] && np <= THRESHOLDS.neck_position[1], expected: "−0.05 – 0.15", weight: 1,
    });
  } else {
    metrics.push({ key: "neck_position", label: "Neck cut below chin (×H)", value: null, pass: null, expected: "needs chin", weight: 1 });
  }

  metrics.push({
    key: "border_contact", label: "Outline on image border", value: allPts ? borderPts / allPts : 0,
    pass: null, expected: "informational", weight: 0,
  });

  if (e.featuresEnabled && e.featureStats) {
    const fs = e.featureStats;
    const exp = fs.expected;
    const presentFrac = exp.length ? exp.filter((k) => fs.present[k]).length / exp.length : 1;
    metrics.push({
      key: "features_present", label: "Expected features found", value: presentFrac,
      pass: presentFrac >= THRESHOLDS.features_present_min, expected: `≥ ${THRESHOLDS.features_present_min * 100}%`, weight: 1,
    });
    metrics.push({
      key: "feature_symmetry", label: "Feature symmetry (frontal)", value: fs.symmetry,
      pass: fs.symmetry === null ? null : fs.symmetry >= THRESHOLDS.symmetry_min, expected: fs.symmetry === null ? "frontal only" : `≥ ${THRESHOLDS.symmetry_min}`, weight: 0.5,
    });
    metrics.push({
      key: "features_outside", label: "Feature points outside head", value: fs.outsideFraction,
      pass: fs.outsideFraction <= THRESHOLDS.features_outside_max, expected: `≤ ${THRESHOLDS.features_outside_max * 100}%`, weight: 0.5,
    });
  }
  return metrics;
}

/** Share of applicable metrics in range, weighted. */
export function metricScore(metrics: Metric[]): number {
  let s = 0, t = 0;
  for (const m of metrics) {
    if (m.pass === null || m.weight <= 0) continue;
    t += m.weight;
    if (m.pass) s += m.weight;
  }
  return t ? s / t : 0;
}

export function allMetricsPass(metrics: Metric[]): boolean {
  return metrics.every((m) => m.pass !== false);
}

function densify(points: Pt[], closed: boolean, step: number): Pt[] {
  const out: Pt[] = [];
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  return out;
}

/** Is the result an empty / tiny mask (pipeline failure, §13)? */
export function isTinyMask(alpha: Float32Array, w: number, h: number): boolean {
  return area(alpha, 0.5) < 0.002 * w * h;
}
