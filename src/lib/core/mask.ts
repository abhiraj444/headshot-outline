/**
 * Mask math on single-channel Float32 / Uint8 arrays (row-major, width w, height h).
 * Pure functions, no DOM — safe for Web Workers and unit tests.
 */

export type Mask = Float32Array;

export function binarize(m: ArrayLike<number>, t = 0.5): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] >= t ? 1 : 0;
  return out;
}

export function toFloat(b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b[i];
  return out;
}

export function area(b: ArrayLike<number>, t = 0.5): number {
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] >= t) n++;
  return n;
}

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared distance from every pixel to the nearest pixel where `b` is set. */
export function distanceToSet(b: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = b[i] ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}

export function dilate(b: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return b.slice();
  const d = distanceToSet(b, w, h);
  const r2 = r * r;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
  return out;
}

export function erode(b: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return b.slice();
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = b[i] ? 0 : 1;
  const d = distanceToSet(inv, w, h);
  const r2 = r * r;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = b[i] && d[i] > r2 ? 1 : 0;
  return out;
}

export function close(b: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return r <= 0 ? b.slice() : erode(dilate(b, w, h, r), w, h, r);
}

/** 4-connected component labelling. Returns labels (0 = background) and sizes (index = label). */
export function components(b: Uint8Array, w: number, h: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let i = 0; i < w * h; i++) {
    if (!b[i] || labels[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = next;
    let size = 0;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && b[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack[sp++] = p - 1; }
      if (x < w - 1 && b[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack[sp++] = p + 1; }
      if (y > 0 && b[p - w] && !labels[p - w]) { labels[p - w] = next; stack[sp++] = p - w; }
      if (y < h - 1 && b[p + w] && !labels[p + w]) { labels[p + w] = next; stack[sp++] = p + w; }
    }
    sizes.push(size);
    next++;
  }
  return { labels, sizes };
}

export function keepLargest(b: Uint8Array, w: number, h: number): Uint8Array {
  const { labels, sizes } = components(b, w, h);
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > (sizes[best] ?? 0)) best = i;
  const out = new Uint8Array(w * h);
  if (!best) return out;
  for (let i = 0; i < out.length; i++) out[i] = labels[i] === best ? 1 : 0;
  return out;
}

/** Remove components smaller than minSize pixels. */
export function removeSmall(b: Uint8Array, w: number, h: number, minSize: number): Uint8Array {
  const { labels, sizes } = components(b, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = labels[i] && sizes[labels[i]] >= minSize ? 1 : 0;
  return out;
}

export function fillHoles(b: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!b[p] && !outside[p]) { outside[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** Box filter (mean) with radius r via integral image. */
export function boxBlur(src: ArrayLike<number>, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(w * h);
  if (r < 1) { for (let i = 0; i < out.length; i++) out[i] = src[i]; return out; }
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const s = I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0];
      out[y * w + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

/** Grey-guide guided filter (He et al.). */
export function guidedFilter(guide: Float32Array, p: Float32Array, w: number, h: number, r: number, eps = 1e-3): Float32Array {
  if (r < 1) return p.slice();
  const n = w * h;
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = guide[i] * p[i]; II[i] = guide[i] * guide[i]; }
  const mI = boxBlur(guide, w, h, r), mp = boxBlur(p, w, h, r);
  const mIp = boxBlur(Ip, w, h, r), mII = boxBlur(II, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIp[i] - mI[i] * mp[i];
    const v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxBlur(a, w, h, r), mb = boxBlur(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, ma[i] * guide[i] + mb[i]));
  return out;
}

export function grayFromRGBA(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  return g;
}

/** Sobel gradient magnitude. */
export function gradientMagnitude(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

export interface Pt { x: number; y: number }

/** Andrew's monotone chain convex hull. */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Boundary pixels of a binary mask (set pixels with an unset 4-neighbour). */
export function boundaryPoints(b: Uint8Array, w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!b[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !b[i - 1] || !b[i + 1] || !b[i - w] || !b[i + w]) {
        pts.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }
  return pts;
}

export function union(...ms: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(ms[0].length);
  for (const m of ms) for (let i = 0; i < out.length; i++) if (m[i]) out[i] = 1;
  return out;
}

export function bbox(b: Uint8Array, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function centroid(b: Uint8Array, w: number, h: number): Pt | null {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[y * w + x]) { sx += x; sy += y; n++; }
  return n ? { x: sx / n + 0.5, y: sy / n + 0.5 } : null;
}
