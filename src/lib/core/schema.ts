/**
 * Parameter schema (tech doc §5) + the `features` extension.
 * The pipeline is deterministic and fully controlled by one Params object;
 * the AI critic only proposes patches to it.
 */

export const SCHEMA_VERSION = 2;

export const MATTE_MODELS = ["modnet", "rmbg-1.4", "birefnet"] as const;
export type MatteModel = (typeof MATTE_MODELS)[number];

export const KEEP_CLASSES = [
  "skin",
  "nose",
  "eyes",
  "brows",
  "ears",
  "glasses",
  "lips",
  "hair",
  "hat",
  "earring",
] as const;
export type KeepClass = (typeof KEEP_CLASSES)[number];

export const FEATURE_DETAILS = ["outline_only", "minimal", "standard", "detailed"] as const;
export type FeatureDetail = (typeof FEATURE_DETAILS)[number];

export const FEATURE_KEYS = [
  "brows",
  "eyes",
  "glasses",
  "nose",
  "lips",
  "ears",
  "hairline",
  "jaw",
  "beard",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface Params {
  schema_version: number;
  matte: { enabled: boolean; model: MatteModel; threshold: number };
  parsing: { enabled: boolean; keep: KeepClass[]; include_hat: boolean };
  combine: { region_dilate: number };
  neck_cut: { enabled: boolean; offset: number; angle_deg: number; feather: number };
  cleanup: {
    keep_largest: boolean;
    fill_holes: boolean;
    close_radius: number;
    guided_filter_radius: number;
    decontaminate_edges: boolean;
  };
  outline: {
    smoothing: number;
    simplify_epsilon: number;
    stroke_px: number;
    close_at_image_edge: boolean;
  };
  features: {
    enabled: boolean;
    detail: FeatureDetail;
    include: Record<FeatureKey, boolean>;
    min_area: number;
    stroke_ratio: number;
    smoothing: number;
  };
  fallback: { use_grabcut: boolean };
}

export const DEFAULT_PARAMS: Params = {
  schema_version: SCHEMA_VERSION,
  matte: { enabled: true, model: "modnet", threshold: 0.5 },
  parsing: {
    enabled: true,
    keep: ["skin", "nose", "eyes", "brows", "ears", "glasses", "lips", "hair"],
    include_hat: false,
  },
  combine: { region_dilate: 0.03 },
  neck_cut: { enabled: true, offset: 0.0, angle_deg: 0, feather: 0.03 },
  cleanup: {
    keep_largest: true,
    fill_holes: true,
    close_radius: 0.015,
    guided_filter_radius: 0.01,
    decontaminate_edges: true,
  },
  outline: { smoothing: 0.5, simplify_epsilon: 0.004, stroke_px: 4, close_at_image_edge: true },
  features: {
    enabled: true,
    detail: "standard",
    include: {
      brows: true,
      eyes: true,
      glasses: true,
      nose: true,
      lips: true,
      ears: true,
      hairline: true,
      jaw: false,
      beard: false,
    },
    min_area: 0.002,
    stroke_ratio: 0.6,
    smoothing: 0.5,
  },
  fallback: { use_grabcut: false },
};

export type FieldSpec =
  | { kind: "number"; min: number; max: number; step: number; ai: boolean; label: string }
  | { kind: "int"; min: number; max: number; step: number; ai: boolean; label: string }
  | { kind: "boolean"; ai: boolean; label: string }
  | { kind: "enum"; values: readonly string[]; ai: boolean; label: string }
  | { kind: "set"; values: readonly string[]; ai: boolean; label: string };

/**
 * Flat schema "section.field" (and "features.include.<key>") -> spec.
 * Ranges are the validator ranges from §5. `ai` = whether the critic may patch it.
 */
export const PARAM_SPECS: Record<string, FieldSpec> = {
  "matte.enabled": { kind: "boolean", ai: false, label: "Person matte" },
  "matte.model": { kind: "enum", values: MATTE_MODELS, ai: false, label: "Matte model" },
  "matte.threshold": { kind: "number", min: 0.2, max: 0.8, step: 0.01, ai: true, label: "Matte threshold" },
  "parsing.enabled": { kind: "boolean", ai: false, label: "Face parsing" },
  "parsing.keep": { kind: "set", values: KEEP_CLASSES, ai: true, label: "Kept classes" },
  "parsing.include_hat": { kind: "boolean", ai: true, label: "Include hat" },
  "combine.region_dilate": { kind: "number", min: 0, max: 0.08, step: 0.005, ai: true, label: "Region dilate (×H)" },
  "neck_cut.enabled": { kind: "boolean", ai: true, label: "Neck cut" },
  "neck_cut.offset": { kind: "number", min: -0.15, max: 0.15, step: 0.005, ai: true, label: "Neck offset (×H)" },
  "neck_cut.angle_deg": { kind: "number", min: -30, max: 30, step: 1, ai: true, label: "Neck angle (°)" },
  "neck_cut.feather": { kind: "number", min: 0.01, max: 0.08, step: 0.005, ai: true, label: "Neck feather (×H)" },
  "cleanup.keep_largest": { kind: "boolean", ai: true, label: "Keep largest region" },
  "cleanup.fill_holes": { kind: "boolean", ai: true, label: "Fill holes" },
  "cleanup.close_radius": { kind: "number", min: 0, max: 0.04, step: 0.001, ai: true, label: "Close radius (×H)" },
  "cleanup.guided_filter_radius": { kind: "number", min: 0, max: 0.03, step: 0.001, ai: true, label: "Guided filter radius (×H)" },
  "cleanup.decontaminate_edges": { kind: "boolean", ai: false, label: "Decontaminate edges" },
  "outline.smoothing": { kind: "number", min: 0, max: 1, step: 0.05, ai: true, label: "Outline smoothing" },
  "outline.simplify_epsilon": { kind: "number", min: 0.001, max: 0.012, step: 0.0005, ai: true, label: "Simplify ε (×H)" },
  "outline.stroke_px": { kind: "int", min: 1, max: 12, step: 1, ai: false, label: "Stroke (px)" },
  "outline.close_at_image_edge": { kind: "boolean", ai: true, label: "Close at image edge" },
  "features.enabled": { kind: "boolean", ai: true, label: "Facial features" },
  "features.detail": { kind: "enum", values: FEATURE_DETAILS, ai: true, label: "Feature detail" },
  "features.min_area": { kind: "number", min: 0.0002, max: 0.02, step: 0.0002, ai: true, label: "Min feature area (×H²)" },
  "features.stroke_ratio": { kind: "number", min: 0.2, max: 1, step: 0.05, ai: false, label: "Feature stroke ratio" },
  "features.smoothing": { kind: "number", min: 0, max: 1, step: 0.05, ai: true, label: "Feature smoothing" },
  "fallback.use_grabcut": { kind: "boolean", ai: true, label: "GrabCut fallback" },
  ...Object.fromEntries(
    FEATURE_KEYS.map((k) => [`features.include.${k}`, { kind: "boolean", ai: true, label: `Include ${k}` } as FieldSpec]),
  ),
};

/** Checklist (§8.3 + features extension). */
export const CHECKLIST_KEYS = [
  "hair_fully_inside",
  "neck_or_collar_inside",
  "glasses_included",
  "background_inside",
  "single_closed_outline",
  "follows_visible_head",
  "eyes_correct",
  "brows_correct",
  "nose_correct",
  "lips_correct",
  "ears_correct",
  "recognisable",
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/** Value that counts as "satisfactory" for each checklist item. */
export const CHECKLIST_GOOD: Record<ChecklistKey, (v: unknown) => boolean> = {
  hair_fully_inside: (v) => v === true,
  neck_or_collar_inside: (v) => v === false,
  glasses_included: (v) => v === "yes" || v === "na",
  background_inside: (v) => v === false,
  single_closed_outline: (v) => v === true,
  follows_visible_head: (v) => v === true,
  eyes_correct: (v) => v === true,
  brows_correct: (v) => v === true,
  nose_correct: (v) => v === true,
  lips_correct: (v) => v === true,
  ears_correct: (v) => v === true,
  recognisable: (v) => v === true,
};

export const FEATURE_CHECKLIST: ChecklistKey[] = [
  "eyes_correct",
  "brows_correct",
  "nose_correct",
  "lips_correct",
  "ears_correct",
  "recognisable",
];

export const ISSUE_TYPES = [
  "neck_leak",
  "collar_leak",
  "hair_cut",
  "background_leak",
  "fragment",
  "hole",
  "glasses_missing",
  "hat_issue",
  "feature_missing",
  "feature_misplaced",
  "feature_noise",
  "other",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const REGIONS = [
  "top",
  "bottom",
  "left",
  "right",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
  "inside",
] as const;
export type Region = (typeof REGIONS)[number];

export interface Issue {
  type: IssueType;
  region: Region;
  severity: number;
}

export type Checklist = Partial<Record<ChecklistKey, boolean | "yes" | "no" | "na">>;

export type ParamPatch = {
  [S in Exclude<keyof Params, "schema_version">]?: Partial<
    S extends "features" ? Omit<Params["features"], "include"> & { include: Partial<Params["features"]["include"]> } : Params[S]
  >;
};

export interface CriticReply {
  checklist: Checklist;
  issues: Issue[];
  patch: ParamPatch;
}

/** Preset per Studio "Detail" toggle. */
export const DETAIL_PRESETS: Record<"outline" | "features" | "detailed", { enabled: boolean; detail: FeatureDetail }> = {
  outline: { enabled: false, detail: "outline_only" },
  features: { enabled: true, detail: "standard" },
  detailed: { enabled: true, detail: "detailed" },
};
