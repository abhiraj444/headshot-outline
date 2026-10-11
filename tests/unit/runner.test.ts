import { describe, expect, it } from "vitest";
import { defaultParams } from "@/lib/core/params";
import { labelId } from "@/lib/pipeline/parsing";
import { PipelineRunner } from "@/lib/pipeline/run";

/** Synthetic frontal "person": hair cap, skin face, eyes, brows, nose, lips, ears, neck + shoulders. */
function synthetic(w = 240, h = 300) {
  const labels = new Uint8Array(w * h).fill(labelId("background"));
  const matte = new Float32Array(w * h);
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x: number, y: number, name: string, c: [number, number, number]) => {
    const i = y * w + x;
    labels[i] = labelId(name);
    matte[i] = 1;
    rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2];
  };
  const inEll = (x: number, y: number, cx: number, cy: number, a: number, b: number) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y > 230) set(x, y, "cloth", [40, 40, 120]);
    else if (y > 175 && Math.abs(x - 120) < 30) set(x, y, "neck", [200, 150, 120]);
    if (inEll(x, y, 120, 105, 72, 92) && y < 105) set(x, y, "hair", [30, 20, 10]);
    if (inEll(x, y, 120, 120, 55, 75)) set(x, y, "skin", [220, 170, 140]);
    if (inEll(x, y, 62, 125, 8, 16) || inEll(x, y, 178, 125, 8, 16)) set(x, y, x < 120 ? "l_ear" : "r_ear", [210, 160, 130]);
    if (inEll(x, y, 98, 108, 10, 5) || inEll(x, y, 142, 108, 10, 5)) set(x, y, x < 120 ? "l_eye" : "r_eye", [250, 250, 250]);
    if (inEll(x, y, 98, 94, 13, 3) || inEll(x, y, 142, 94, 13, 3)) set(x, y, x < 120 ? "l_brow" : "r_brow", [40, 30, 20]);
    if (inEll(x, y, 120, 130, 8, 14)) set(x, y, "nose", [215, 160, 130]);
    if (inEll(x, y, 120, 160, 18, 4) && y < 160) set(x, y, "u_lip", [180, 80, 80]);
    if (inEll(x, y, 120, 161, 18, 5) && y >= 160) set(x, y, "l_lip", [170, 70, 70]);
  }
  return { id: "synthetic", w, h, rgba, matte, labels };
}

describe("pipeline runner (synthetic)", () => {
  it("produces one closed head outline without the neck, plus feature lines", async () => {
    const img = synthetic();
    const runner = new PipelineRunner(img);
    const p = defaultParams();
    const out = await runner.run(p);
    expect(out.outline.length).toBe(1);
    expect(out.outline[0].closed).toBe(true);
    const maxY = Math.max(...out.outline[0].points.map((q) => q.y));
    expect(maxY).toBeLessThan(205); // neck / cloth excluded
    expect(out.metrics.find((m) => m.key === "components")?.value).toBe(1);
    const keys = new Set(out.features.map((g) => g.key));
    for (const k of ["brows", "eyes", "nose", "lips", "ears", "hairline"]) expect(keys.has(k as never)).toBe(true);
    expect(out.featureStats?.symmetry ?? 0).toBeGreaterThan(0.8);
    // every feature point lies inside the head bounds
    for (const g of out.features) for (const pl of g.polylines) for (const q of pl.points) expect(q.y).toBeLessThan(maxY + 2);
  });

  it("outline_only detail draws no features and reuses cached early stages", async () => {
    const runner = new PipelineRunner(synthetic());
    const p = defaultParams();
    await runner.run(p);
    const misses = runner.cache.misses;
    const out = await runner.run({ ...p, features: { ...p.features, detail: "outline_only" } });
    expect(out.features.length).toBe(0);
    expect(runner.cache.misses - misses).toBe(1); // only the features stage recomputed
  });

  it("include/exclude nudges change the mask locally", async () => {
    const runner = new PipelineRunner(synthetic());
    const p = defaultParams();
    const base = await runner.run(p);
    const out = await runner.run(p, [{ x: 120, y: 20, r: 0.15, mode: "exclude" }]);
    const top0 = Math.min(...base.outline[0].points.map((q) => q.y));
    const top1 = Math.min(...out.outline[0].points.map((q) => q.y));
    expect(top1).toBeGreaterThan(top0);
  });
});
