import { describe, expect, it } from "vitest";
import { OscillationGuard } from "@/lib/orchestrator/oscillation";
import { applyPatch, defaultParams } from "@/lib/core/params";

describe("oscillation guard", () => {
  it("passes a first move through unchanged", () => {
    const g = new OscillationGuard();
    const p0 = defaultParams();
    g.record(p0);
    const { patch, actions } = g.guard(p0, { neck_cut: { offset: 0.1 } });
    expect(patch).toEqual({ neck_cut: { offset: 0.1 } });
    expect(actions).toEqual([]);
  });

  it("halves a step that pushes back toward an earlier value, then freezes on repeat", () => {
    const g = new OscillationGuard();
    let p = defaultParams(); // offset 0
    g.record(p);
    p = applyPatch(p, g.guard(p, { neck_cut: { offset: 0.1 } }).patch);
    g.record(p);
    const back = g.guard(p, { neck_cut: { offset: 0 } });
    expect(back.patch.neck_cut?.offset).toBeCloseTo(0.05);
    expect(back.actions[0].action).toBe("halved");
    p = applyPatch(p, back.patch);
    g.record(p);
    const again = g.guard(p, { neck_cut: { offset: 0.1 } });
    expect(again.patch.neck_cut).toBeUndefined();
    expect(again.actions[0].action).toBe("frozen");
    expect(g.frozen.has("neck_cut.offset")).toBe(true);
    // frozen stays frozen
    const later = g.guard(p, { neck_cut: { offset: 0.12, feather: 0.04 } });
    expect(later.patch).toEqual({ neck_cut: { feather: 0.04 } });
    expect(later.actions[0].action).toBe("blocked");
  });

  it("does not treat continued movement in the same direction as a flip", () => {
    const g = new OscillationGuard();
    let p = defaultParams();
    g.record(p);
    for (const v of [0.02, 0.04, 0.06]) {
      const r = g.guard(p, { neck_cut: { offset: v } });
      expect(r.patch.neck_cut?.offset).toBe(v);
      p = applyPatch(p, r.patch);
      g.record(p);
    }
  });

  it("freezes booleans that keep flipping", () => {
    const g = new OscillationGuard();
    let p = defaultParams(); // fill_holes true
    g.record(p);
    p = applyPatch(p, g.guard(p, { cleanup: { fill_holes: false } }).patch);
    g.record(p);
    const back = g.guard(p, { cleanup: { fill_holes: true } }); // flip 1, allowed
    expect(back.patch.cleanup?.fill_holes).toBe(true);
    p = applyPatch(p, back.patch);
    g.record(p);
    const again = g.guard(p, { cleanup: { fill_holes: false } }); // flip 2 → frozen
    expect(again.patch.cleanup).toBeUndefined();
  });
});
