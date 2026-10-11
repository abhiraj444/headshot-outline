/**
 * Pipeline runner: Combine → NeckCut → (nudges) → Cleanup → Outline → Features → Evaluate,
 * with StageCache so a late-stage parameter change does not rerun early stages (§15).
 * Model outputs (matte, label map) are inputs; inference lives in the worker.
 */
import { hashString, stableStringify } from "../core/params";
import { StageCache } from "../core/stagecache";
import { area, binarize, bbox, gradientMagnitude, grayFromRGBA, keepLargest, type Pt } from "../core/mask";
import { maskOf } from "./parsing";
import type { Params } from "../core/schema";
import { allMetricsPass, evaluate, isTinyMask, metricScore, type Metric } from "../eval/metrics";
import { cleanup, decontaminate } from "./cleanup";
import { applyNudges, combine, type Nudge } from "./combine";
import { extractFeatures, type FeatureGroup, type FeatureStats, type LandmarkLines } from "./features";
import { grabCutLite, skinRect } from "./fallback";
import { geometryFromMatte, geometryFromParsing, type HeadGeom } from "./geometry";
import { applyNeckCut, type NeckLine } from "./neckcut";
import { extractOutline, type Polyline } from "./outline";

export interface ImageState {
  id: string;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  matte: Float32Array | null;
  labels: Uint8Array | null;
}

export interface RunOutput {
  w: number;
  h: number;
  H: number;
  outline: Polyline[];
  features: FeatureGroup[];
  featureStats: FeatureStats | null;
  metrics: Metric[];
  metricScore: number;
  metricsPass: boolean;
  tiny: boolean;
  neckLine: NeckLine | null;
  geom: { pose: HeadGeom["pose"]; source: HeadGeom["source"]; chin: Pt; axis: Pt; H: number } | null;
  cutout: Uint8ClampedArray;
  usedGrabcut: boolean;
  cache: { hits: number; misses: number };
  ms: number;
  warnings: string[];
  imageClass: ImageClass;
}

export interface ImageClass {
  pose: "front" | "three_quarter" | "profile";
  hair: "short" | "medium" | "long" | "none";
  accessories: "sunglasses" | "glasses" | "hat" | "none";
}

export class PipelineRunner {
  cache = new StageCache(40);
  private gray: Float32Array | null = null;
  private grad: Float32Array | null = null;
  private gradMean = 0;
  constructor(public img: ImageState) {
    this.gray = grayFromRGBA(img.rgba, img.w, img.h);
    this.grad = gradientMagnitude(this.gray, img.w, img.h);
    let s = 0;
    for (let i = 0; i < this.grad.length; i++) s += this.grad[i];
    this.gradMean = s / this.grad.length || 1e-6;
  }

  private geometry(p: Params): Promise<HeadGeom | null> {
    const { w, h, labels, matte } = this.img;
    const key = StageCache.key("geom", this.img.id, { parsing: p.parsing.enabled, t: p.matte.threshold });
    return this.cache.get(key, () => {
      let g: HeadGeom | null = null;
      if (p.parsing.enabled && labels) g = geometryFromParsing(labels, w, h);
      if (!g && matte) g = geometryFromMatte(binarize(matte, p.matte.threshold), w, h);
      return g;
    });
  }

  imageClass(geom: HeadGeom | null): ImageClass {
    const { labels, w, h, rgba } = this.img;
    const cls: ImageClass = { pose: geom?.pose ?? "three_quarter", hair: "medium", accessories: "none" };
    if (!labels) return cls;
    let skin = 0, hair = 0, glasses = 0, hat = 0, eyes = 0, gl = 0;
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      if (l === 1) skin++;
      else if (l === 13) hair++;
      else if (l === 3) { glasses++; gl += 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; }
      else if (l === 14) hat++;
      else if (l === 4 || l === 5) eyes++;
    }
    const r = skin ? hair / skin : 0;
    cls.hair = r < 0.05 ? "none" : r < 0.6 ? "short" : r < 1.3 ? "medium" : "long";
    if (hat > 0.05 * skin) cls.accessories = "hat";
    else if (glasses > 0.01 * skin) cls.accessories = gl / glasses < 70 && eyes < glasses * 0.1 ? "sunglasses" : "glasses";
    void w; void h;
    return cls;
  }

  async run(p: Params, nudges: Nudge[] = [], landmarks: LandmarkLines | null = null): Promise<RunOutput> {
    const t0 = performance.now();
    const { w, h, rgba, matte, labels, id } = this.img;
    const warnings: string[] = [];
    const geom = await this.geometry(p);
    const H = geom?.H ?? Math.min(w, h) * 0.5;
    const gKey = id + (geom ? `${geom.H.toFixed(1)}` : "nogeom");

    const combineSlice = { matte: p.matte, parsing: p.parsing, combine: p.combine, fallback: p.fallback };
    const kCombine = StageCache.key("combine", gKey, combineSlice);
    let usedGrabcut = false;
    const combined = await this.cache.get(kCombine, () => {
      if (p.fallback.use_grabcut || (!matte && !labels)) {
        const hb = labels ? bbox(maskOf(labels, [1, 2, 4, 5, 6, 7, 10, 11, 12, 13]), w, h) : null;
        const rect = hb
          ? { x0: Math.max(0, hb.x0 - 10), y0: Math.max(0, hb.y0 - 10), x1: Math.min(w - 1, hb.x1 + 10), y1: Math.min(h - 1, hb.y1 + 10) }
          : skinRect(rgba, w, h) ?? { x0: Math.round(w * 0.2), y0: Math.round(h * 0.05), x1: Math.round(w * 0.8), y1: Math.round(h * 0.75) };
        return { alpha: grabCutLite(rgba, w, h, rect), grabcut: true };
      }
      let headBox: Uint8Array | null = null;
      if ((!p.parsing.enabled || !labels) && geom && matte) {
        // head region from the top blob of the matte, above the estimated chin (with margin)
        headBox = new Uint8Array(w * h);
        const person = keepLargest(binarize(matte, p.matte.threshold), w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!person[i]) continue;
          const pr = (x + 0.5 - geom.axis.center.x) * geom.axis.axis.x + (y + 0.5 - geom.axis.center.y) * geom.axis.axis.y;
          if (pr >= geom.chinProj - 0.2 * H) headBox[i] = 1;
        }
      }
      return { alpha: combine({ w, h, H, matte, labels, headBoxRegion: headBox }, p), grabcut: false };
    });
    usedGrabcut = combined.grabcut;

    const kNeck = StageCache.key("neck", kCombine, p.neck_cut);
    const neck = await this.cache.get(kNeck, () =>
      geom ? applyNeckCut(combined.alpha, w, h, geom, p.neck_cut) : { alpha: combined.alpha, line: null },
    );

    const kNudge = StageCache.key("nudge", kNeck, nudges);
    const nudged = await this.cache.get(kNudge, () => applyNudges(neck.alpha, w, h, H, nudges));

    const kClean = StageCache.key("cleanup", kNudge, p.cleanup);
    const cleaned = await this.cache.get(kClean, () => cleanup(nudged, this.gray!, w, h, H, p.cleanup));

    const kOutline = StageCache.key("outline", kClean, p.outline);
    const outline = await this.cache.get(kOutline, () =>
      extractOutline(cleaned, w, h, { smoothing: p.outline.smoothing, simplifyEps: p.outline.simplify_epsilon * H, closeAtEdge: p.outline.close_at_image_edge }),
    );

    const lmHash = landmarks ? hashString(stableStringify(landmarks)) : "none";
    const kFeat = StageCache.key("features", kClean + lmHash, { f: p.features, eps: p.outline.simplify_epsilon });
    const feat = await this.cache.get(kFeat, () => extractFeatures({ w, h, labels, alpha: cleaned, geom, landmarks }, p));

    const tiny = isTinyMask(cleaned, w, h);
    if (tiny) warnings.push("The head mask is empty or tiny.");
    if (!labels && p.parsing.enabled) warnings.push("Face parsing unavailable; head region estimated from the person matte.");
    if (usedGrabcut) warnings.push("Classical GrabCut fallback used; hair edges may be weaker.");

    const metrics = evaluate({
      w, h, alpha: cleaned, personMatte: matte, matteThreshold: p.matte.threshold,
      gradient: this.grad!, gradientMean: this.gradMean, outline, axis: geom?.axis ?? null, H,
      chinProj: geom ? geom.chinProj : null,
      featuresEnabled: p.features.enabled && p.features.detail !== "outline_only",
      featureStats: feat.stats,
    });
    const cutout = decontaminate(rgba, cleaned, w, h, H, p.cleanup.decontaminate_edges);
    return {
      w, h, H,
      outline,
      features: feat.groups,
      featureStats: feat.stats,
      metrics,
      metricScore: metricScore(metrics),
      metricsPass: allMetricsPass(metrics),
      tiny,
      neckLine: neck.line,
      geom: geom ? { pose: geom.pose, source: geom.source, chin: geom.chinPoint, axis: geom.axis.axis, H: geom.H } : null,
      cutout,
      usedGrabcut,
      cache: { hits: this.cache.hits, misses: this.cache.misses },
      ms: Math.round(performance.now() - t0),
      warnings,
      imageClass: this.imageClass(geom),
    };
  }
}

export function noPersonDetected(img: ImageState): boolean {
  const { w, h, matte, labels } = img;
  const personA = matte ? area(matte, 0.5) : 0;
  let faceA = 0;
  if (labels) for (let i = 0; i < labels.length; i++) if (labels[i] >= 1 && labels[i] <= 13) faceA++;
  return personA < 0.01 * w * h && faceA < 0.002 * w * h;
}
