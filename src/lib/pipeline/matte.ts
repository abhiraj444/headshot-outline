/**
 * Person matte (tech doc §6.1). Models run through transformers.js
 * `pipeline('background-removal', …)` inside the worker. Primary MODNet,
 * fallback RMBG-1.4; BiRefNet-lite optional (large download).
 */
import type { MatteModel } from "../core/schema";

export const MATTE_MODEL_IDS: Record<MatteModel, string> = {
  modnet: "Xenova/modnet",
  "rmbg-1.4": "briaai/RMBG-1.4",
  birefnet: "onnx-community/BiRefNet_lite",
};

/** Ordered list of models to try for the selected one. */
export function matteFallbackChain(selected: MatteModel): string[] {
  const order: MatteModel[] = [selected, "modnet", "rmbg-1.4"];
  return Array.from(new Set(order.map((m) => MATTE_MODEL_IDS[m])));
}

/** Extract the alpha channel of an RGBA RawImage-like output as a 0..1 matte. */
export function matteFromRGBA(img: { data: ArrayLike<number>; width: number; height: number; channels: number }, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const { data, width, height, channels } = img;
  const same = width === w && height === h;
  for (let y = 0; y < h; y++) {
    const sy = same ? y : Math.min(height - 1, Math.floor((y * height) / h));
    for (let x = 0; x < w; x++) {
      const sx = same ? x : Math.min(width - 1, Math.floor((x * width) / w));
      const idx = (sy * width + sx) * channels + (channels - 1);
      out[y * w + x] = data[idx] / 255;
    }
  }
  return out;
}

export function thresholdMatte(m: Float32Array, t: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = m[i] >= t ? 1 : 0;
  return out;
}
