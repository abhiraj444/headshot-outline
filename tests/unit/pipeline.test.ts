import { describe, expect, it } from "vitest";
import { estimateHeadAxis } from "@/lib/core/headaxis";
import { StageCache } from "@/lib/core/stagecache";
import { extractOutline, marchingSquares, signedArea } from "@/lib/pipeline/outline";

function ellipse(w: number, h: number, cx: number, cy: number, a: number, b: number, rotDeg: number) {
  const m = new Uint8Array(w * h);
  const t = (rotDeg * Math.PI) / 180;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = dx * Math.cos(t) + dy * Math.sin(t), v = -dx * Math.sin(t) + dy * Math.cos(t);
    if ((u * u) / (a * a) + (v * v) / (b * b) <= 1) m[y * w + x] = 1;
  }
  return m;
}

describe("pipeline geometry", () => {
  it("head axis follows a rotated synthetic head", () => {
    // tall ellipse rotated by 20° (long axis along the rotated y)
    const m = ellipse(200, 200, 100, 100, 40, 80, 20);
    const ax = estimateHeadAxis(m, 200, 200, null)!;
    const angle = (Math.atan2(ax.axis.x, -ax.axis.y) * 180) / Math.PI;
    expect(Math.abs(Math.abs(angle) - 20)).toBeLessThan(3);
    expect(ax.H).toBeGreaterThan(150);
  });

  it("marching squares finds outer loop and holes", () => {
    const w = 7, h = 7, f = new Float32Array(w * h);
    for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) f[y * w + x] = 1;
    f[3 * w + 3] = 0;
    const loops = marchingSquares(f, w, h);
    expect(loops.length).toBe(2);
    expect(loops.filter((l) => signedArea(l) > 0).length).toBe(1);
  });

  it("closes a contour along the image edge, or leaves it open", () => {
    const w = 50, h = 50, f = new Float32Array(w * h);
    for (let y = 10; y < 50; y++) for (let x = 10; x < 40; x++) f[y * w + x] = 1; // touches the bottom border
    const closed = extractOutline(f, w, h, { smoothing: 0, simplifyEps: 0.5, closeAtEdge: true });
    expect(closed.length).toBe(1);
    expect(closed[0].closed).toBe(true);
    expect(closed[0].points.some((p) => p.y === h)).toBe(true);
    const open = extractOutline(f, w, h, { smoothing: 0, simplifyEps: 0.5, closeAtEdge: false });
    expect(open.every((pl) => !pl.closed)).toBe(true);
  });

  it("stage cache invalidates only when the slice changes", async () => {
    const c = new StageCache();
    let runs = 0;
    const k1 = StageCache.key("neck", "up", { offset: 0 });
    await c.get(k1, () => ++runs);
    await c.get(StageCache.key("neck", "up", { offset: 0 }), () => ++runs);
    expect(runs).toBe(1);
    await c.get(StageCache.key("neck", "up", { offset: 0.1 }), () => ++runs);
    await c.get(StageCache.key("neck", "up2", { offset: 0 }), () => ++runs);
    expect(runs).toBe(3);
  });
});
