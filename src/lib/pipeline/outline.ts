/**
 * Outline extraction (tech doc §6.6): marching squares at iso 0.5 →
 * optional border clipping/closing → Chaikin smoothing → Douglas–Peucker.
 */
import type { Pt } from "../core/mask";

export interface Polyline {
  points: Pt[];
  closed: boolean;
}

/**
 * Marching squares over a scalar field (values 0..1), iso level `iso`.
 * The field is treated as zero-padded so every loop is closed.
 * Returns all loops (outer boundaries and holes) with sub-pixel interpolation.
 * Coordinates are pixel-centre based (pixel i sits at i + 0.5).
 */
export function marchingSquares(field: ArrayLike<number>, w: number, h: number, iso = 0.5): Pt[][] {
  const W = w + 2, Hh = h + 2;
  const val = (x: number, y: number) => (x <= 0 || y <= 0 || x > w || y > h ? 0 : field[(y - 1) * w + (x - 1)]);
  // edge ids: horizontal edge (x,y)-(x+1,y) => 2*(y*W+x); vertical (x,y)-(x,y+1) => 2*(y*W+x)+1
  const hEdge = (x: number, y: number) => 2 * (y * W + x);
  const vEdge = (x: number, y: number) => 2 * (y * W + x) + 1;
  const pointOf = new Map<number, Pt>();
  const interp = (id: number): Pt => {
    let p = pointOf.get(id);
    if (p) return p;
    const base = id >> 1;
    const x = base % W, y = (base - x) / W;
    const a = val(x, y);
    if (id & 1) {
      const b = val(x, y + 1);
      const t = b === a ? 0.5 : Math.min(1, Math.max(0, (iso - a) / (b - a)));
      p = { x: x - 1 + 0.5, y: y - 1 + 0.5 + t };
    } else {
      const b = val(x + 1, y);
      const t = b === a ? 0.5 : Math.min(1, Math.max(0, (iso - a) / (b - a)));
      p = { x: x - 1 + 0.5 + t, y: y - 1 + 0.5 };
    }
    pointOf.set(id, p);
    return p;
  };
  // next: directed links edge -> edge (keeps foreground on a consistent side)
  const next = new Map<number, number>();
  for (let y = 0; y < Hh - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = val(x, y) >= iso ? 1 : 0;
      const tr = val(x + 1, y) >= iso ? 1 : 0;
      const br = val(x + 1, y + 1) >= iso ? 1 : 0;
      const bl = val(x, y + 1) >= iso ? 1 : 0;
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const T = hEdge(x, y), B = hEdge(x, y + 1), L = vEdge(x, y), R = vEdge(x + 1, y);
      const link = (a: number, b: number) => next.set(a, b);
      switch (c) {
        case 1: link(L, B); break;
        case 2: link(B, R); break;
        case 3: link(L, R); break;
        case 4: link(R, T); break;
        case 5: link(L, T); link(R, B); break; // saddle: separate
        case 6: link(B, T); break;
        case 7: link(L, T); break;
        case 8: link(T, L); break;
        case 9: link(T, B); break;
        case 10: link(T, R); link(B, L); break; // saddle
        case 11: link(T, R); break;
        case 12: link(R, L); break;
        case 13: link(R, B); break;
        case 14: link(B, L); break;
      }
    }
  }
  const loops: Pt[][] = [];
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const loop: Pt[] = [];
    let e: number | undefined = start;
    let guard = 0;
    while (e !== undefined && !visited.has(e) && guard++ < 4_000_000) {
      visited.add(e);
      loop.push(interp(e));
      e = next.get(e);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function signedArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Chaikin corner cutting. `iterations` 0..4. */
export function chaikin(points: Pt[], closed: boolean, iterations: number): Pt[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: Pt[] = [];
    const n = pts.length;
    if (!closed) out.push(pts[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

/** Moving-average pre-smoothing (removes pixel staircase before Chaikin). */
export function movingAverage(points: Pt[], closed: boolean, radius: number): Pt[] {
  if (radius < 1 || points.length < 2 * radius + 1) return points;
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      if (closed) j = (j + n) % n;
      else if (j < 0 || j >= n) continue;
      sx += points[j].x; sy += points[j].y; c++;
    }
    out.push(!closed && (i === 0 || i === n - 1) ? points[i] : { x: sx / c, y: sy / c });
  }
  return out;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Douglas–Peucker (iterative). */
export function douglasPeucker(points: Pt[], eps: number): Pt[] {
  if (points.length < 3 || eps <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > eps) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function simplifyClosed(points: Pt[], eps: number): Pt[] {
  if (points.length < 4) return points;
  // split at the farthest pair so DP works on a closed ring
  let far = 0, best = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (d > best) { best = d; far = i; }
  }
  const a = douglasPeucker(points.slice(0, far + 1), eps);
  const b = douglasPeucker(points.slice(far).concat([points[0]]), eps);
  return a.concat(b.slice(1, -1));
}

/** Smoothing strength 0..1 → (moving-average radius, chaikin iterations). */
export function smoothPolyline(points: Pt[], closed: boolean, smoothing: number): Pt[] {
  const s = Math.min(1, Math.max(0, smoothing));
  const ma = Math.round(s * 4);
  const iters = Math.round(1 + s * 2);
  return chaikin(movingAverage(points, closed, ma), closed, s === 0 ? 0 : iters);
}

/** Is p on (within tol of) the image border? */
export function onBorder(p: Pt, w: number, h: number, tol = 1.01): boolean {
  return p.x <= tol || p.y <= tol || p.x >= w - tol || p.y >= h - tol;
}

/** Clip a closed contour to the image rectangle. */
export function clampToRect(points: Pt[], w: number, h: number): Pt[] {
  return points.map((p) => ({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) }));
}

/**
 * Snap border-adjacent points to the exact image edge (closing along the edge),
 * or — when `closeAtEdge` is false — split the loop into open polylines that
 * omit the border runs.
 */
export function handleBorder(loop: Pt[], w: number, h: number, closeAtEdge: boolean): Polyline[] {
  const snapped = loop.map((p) => ({
    x: p.x <= 0.51 ? 0 : p.x >= w - 0.51 ? w : p.x,
    y: p.y <= 0.51 ? 0 : p.y >= h - 0.51 ? h : p.y,
  }));
  const isB = snapped.map((p) => onBorder(p, w, h, 0.01));
  if (closeAtEdge || !isB.some(Boolean)) return [{ points: clampToRect(snapped, w, h), closed: true }];
  // rotate so we start on a border point, then collect non-border runs
  const n = snapped.length;
  const start = isB.indexOf(true);
  const out: Polyline[] = [];
  let run: Pt[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (isB[i]) {
      if (run.length) { run.push(snapped[i]); out.push({ points: run, closed: false }); run = []; }
    } else {
      if (!run.length) run.push(snapped[(i - 1 + n) % n]);
      run.push(snapped[i]);
    }
  }
  if (run.length > 1) out.push({ points: run, closed: false });
  return out.filter((r) => r.points.length > 1);
}

export interface OutlineOptions {
  smoothing: number;
  simplifyEps: number; // pixels
  closeAtEdge: boolean;
}

/** Full §6.6 pipeline on an alpha mask: returns the outer contour(s) of the main shape. */
export function extractOutline(alpha: ArrayLike<number>, w: number, h: number, o: OutlineOptions): Polyline[] {
  const loops = marchingSquares(alpha, w, h, 0.5);
  if (!loops.length) return [];
  // the outer boundary is the loop with the largest absolute area
  let best = loops[0], bestA = 0;
  for (const l of loops) {
    const a = Math.abs(signedArea(l));
    if (a > bestA) { bestA = a; best = l; }
  }
  return handleBorder(best, w, h, o.closeAtEdge).map((pl) => {
    const sm = smoothPolyline(pl.points, pl.closed, o.smoothing);
    const simp = pl.closed ? simplifyClosed(sm, o.simplifyEps) : douglasPeucker(sm, o.simplifyEps);
    return { points: pl.closed ? clampToRect(simp, w, h) : simp, closed: pl.closed };
  });
}

export function polylineToPath(pl: Polyline, scale = 1, digits = 2): string {
  if (!pl.points.length) return "";
  const f = (v: number) => (v * scale).toFixed(digits).replace(/\.?0+$/, "");
  const [p0, ...rest] = pl.points;
  return `M${f(p0.x)} ${f(p0.y)}` + rest.map((p) => `L${f(p.x)} ${f(p.y)}`).join("") + (pl.closed ? "Z" : "");
}

export function polylineLength(pl: Polyline): number {
  let s = 0;
  const pts = pl.points;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (pl.closed && pts.length > 1) s += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return s;
}
