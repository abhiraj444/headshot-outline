/**
 * Face parsing (tech doc §6.2). Model: jonathandinu/face-parsing (SegFormer
 * trained on CelebAMask-HQ). The worker turns the pipeline output into a
 * per-pixel label map; this module holds the label vocabulary and keep-list mapping.
 */
import type { KeepClass, Params } from "../core/schema";

export const PARSING_MODEL_ID = "jonathandinu/face-parsing";

/** CelebAMask-HQ label names (index = label id in our label map). */
export const CELEBA_LABELS = [
  "background",
  "skin",
  "nose",
  "eye_g",
  "l_eye",
  "r_eye",
  "l_brow",
  "r_brow",
  "l_ear",
  "r_ear",
  "mouth",
  "u_lip",
  "l_lip",
  "hair",
  "hat",
  "ear_r",
  "neck_l",
  "neck",
  "cloth",
] as const;
export type CelebaLabel = (typeof CELEBA_LABELS)[number];
export const NO_LABEL = 255;

export function labelId(name: string): number {
  const i = (CELEBA_LABELS as readonly string[]).indexOf(name);
  return i < 0 ? NO_LABEL : i;
}

/** Keep-list → CelebA labels. Neck, neck_l and cloth are never kept. */
export const KEEP_MAP: Record<KeepClass, CelebaLabel[]> = {
  skin: ["skin"],
  nose: ["nose"],
  eyes: ["l_eye", "r_eye"],
  brows: ["l_brow", "r_brow"],
  ears: ["l_ear", "r_ear"],
  glasses: ["eye_g"],
  lips: ["u_lip", "l_lip", "mouth"],
  hair: ["hair"],
  hat: ["hat"],
  earring: ["ear_r"],
};

export const NEVER_KEEP: CelebaLabel[] = ["neck", "neck_l", "cloth", "background"];

export function keptLabelIds(p: Params["parsing"]): Set<number> {
  const ids = new Set<number>();
  const keep = new Set<KeepClass>(p.keep);
  if (p.include_hat) keep.add("hat");
  for (const k of keep) for (const l of KEEP_MAP[k] ?? []) if (!NEVER_KEEP.includes(l)) ids.add(labelId(l));
  return ids;
}

export function maskOf(labels: Uint8Array, ids: number[] | Set<number>): Uint8Array {
  const set = ids instanceof Set ? ids : new Set(ids);
  const out = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) if (set.has(labels[i])) out[i] = 1;
  return out;
}

export function maskOfNames(labels: Uint8Array, names: CelebaLabel[]): Uint8Array {
  return maskOf(labels, names.map(labelId));
}

export function labelCounts(labels: Uint8Array): Record<string, number> {
  const counts = new Array(CELEBA_LABELS.length).fill(0);
  for (let i = 0; i < labels.length; i++) if (labels[i] < counts.length) counts[labels[i]]++;
  return Object.fromEntries(CELEBA_LABELS.map((n, i) => [n, counts[i]]));
}

/**
 * Build a label map from transformers.js image-segmentation output
 * ([{ label, mask: RawImage(1ch) }]). Later segments win, which is fine for
 * a semantic (non-overlapping) output.
 */
export function labelMapFromSegments(
  segments: { label: string | null; mask: { data: ArrayLike<number>; width: number; height: number } }[],
  w: number,
  h: number,
): Uint8Array {
  const out = new Uint8Array(w * h).fill(labelId("background"));
  for (const s of segments) {
    if (!s.label) continue;
    const id = labelId(s.label.toLowerCase());
    if (id === NO_LABEL) continue;
    const { data, width, height } = s.mask;
    const sameSize = width === w && height === h;
    for (let y = 0; y < h; y++) {
      const sy = sameSize ? y : Math.min(height - 1, Math.floor((y * height) / h));
      for (let x = 0; x < w; x++) {
        const sx = sameSize ? x : Math.min(width - 1, Math.floor((x * width) / w));
        if (data[sy * width + sx] > 127) out[y * w + x] = id;
      }
    }
  }
  return out;
}
