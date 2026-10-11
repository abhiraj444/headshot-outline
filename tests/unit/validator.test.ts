import { describe, expect, it } from "vitest";
import { extractJson, validateCriticReply, validateParams, validatePatch } from "@/lib/core/validator";
import { DEFAULT_PARAMS } from "@/lib/core/schema";

describe("validator: patches", () => {
  it("clamps out-of-range numbers to the schema range", () => {
    const { patch, report } = validatePatch({ neck_cut: { offset: 0.5, angle_deg: -99 }, matte: { threshold: 0.1 } });
    expect(patch.neck_cut?.offset).toBe(0.15);
    expect(patch.neck_cut?.angle_deg).toBe(-30);
    expect(patch.matte?.threshold).toBe(0.2);
    expect(report.clamped.map((c) => c.path).sort()).toEqual(["matte.threshold", "neck_cut.angle_deg", "neck_cut.offset"]);
  });

  it("drops unknown keys and sections", () => {
    const { patch, report } = validatePatch({ neck_cut: { offset: 0.01, evil: 1 }, shell: { cmd: "rm -rf" }, schema_version: 9 });
    expect(patch).toEqual({ neck_cut: { offset: 0.01 } });
    expect(report.dropped).toContain("neck_cut.evil");
    expect(report.dropped).toContain("shell.cmd");
  });

  it("ignores a single field with the wrong type, keeps the rest", () => {
    const { patch, report } = validatePatch({ neck_cut: { offset: "0.1", feather: 0.05 }, cleanup: { fill_holes: "yes" } });
    expect(patch).toEqual({ neck_cut: { feather: 0.05 } });
    expect(report.ignored.sort()).toEqual(["cleanup.fill_holes", "neck_cut.offset"]);
  });

  it("enforces enum and set allow-lists", () => {
    const { patch } = validatePatch({ matte: { model: "sam-huge" }, parsing: { keep: ["hair", "neck", "cloth", "skin", "hair"] }, features: { detail: "detailed" } });
    expect(patch.matte).toBeUndefined();
    expect(patch.parsing?.keep).toEqual(["hair", "skin"]);
    expect(patch.features?.detail).toBe("detailed");
  });

  it("AI patches cannot touch output-only fields (stroke_px, feature stroke ratio, model)", () => {
    const { patch, report } = validatePatch(
      { outline: { stroke_px: 10, smoothing: 0.7 }, features: { stroke_ratio: 0.9, min_area: 0.004, include: { jaw: true } }, matte: { model: "rmbg-1.4" } },
      { aiOnly: true },
    );
    expect(patch).toEqual({ outline: { smoothing: 0.7 }, features: { min_area: 0.004, include: { jaw: true } } });
    expect(report.dropped).toEqual(expect.arrayContaining(["outline.stroke_px", "features.stroke_ratio", "matte.model"]));
  });

  it("rounds integer fields and clamps feature ranges", () => {
    const { patch } = validatePatch({ outline: { stroke_px: 7.6 }, features: { min_area: 5, smoothing: -1 } });
    expect(patch.outline?.stroke_px).toBe(8);
    expect(patch.features?.min_area).toBe(0.02);
    expect(patch.features?.smoothing).toBe(0);
  });

  it("validateParams fills defaults for missing sections", () => {
    const { params } = validateParams({ neck_cut: { offset: 0.02 } });
    expect(params.neck_cut.offset).toBe(0.02);
    expect(params.features).toEqual(DEFAULT_PARAMS.features);
    expect(params.schema_version).toBe(DEFAULT_PARAMS.schema_version);
  });
});

describe("validator: critic replies", () => {
  it("strips code fences and leading prose", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a": {"b": 2}} thanks')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("no json here")).toThrow();
  });

  it("normalises checklist values and issue enums", () => {
    const { reply } = validateCriticReply({
      checklist: { hair_fully_inside: "yes", neck_or_collar_inside: false, glasses_included: "N/A", recognisable: "no", bogus: true },
      issues: [{ type: "neck_leak", region: "bottom", severity: 9 }, { type: "laser", region: "moon", severity: "x" }],
      patch: { neck_cut: { offset: -0.06 } },
    });
    expect(reply.checklist).toEqual({ hair_fully_inside: true, neck_or_collar_inside: false, glasses_included: "na", recognisable: false });
    expect(reply.issues).toEqual([
      { type: "neck_leak", region: "bottom", severity: 3 },
      { type: "other", region: "inside", severity: 1 },
    ]);
    expect(reply.patch).toEqual({ neck_cut: { offset: -0.06 } });
  });

  it("rejects non-object replies", () => {
    expect(() => validateCriticReply([1, 2])).toThrow();
  });
});
