import { getPath } from "../core/params";
import { CHECKLIST_KEYS, FEATURE_CHECKLIST, ISSUE_TYPES, PARAM_SPECS, REGIONS, type Params } from "../core/schema";
import type { Metric } from "../eval/metrics";

/** Default system prompt: tech doc §8.4, extended for facial-feature lines. */
export const DEFAULT_SYSTEM_PROMPT = `You review a head outline. The image shows the original photo on the left and the same photo with a red outline on the right. The outline should follow only the visible head: face, hair, ears, and glasses or sunglasses if worn. It must not include the neck below the chin, collar, shoulders, or background. Thinner red lines inside the head are facial-feature lines (brows, eyes, nose, lips, ears, hairline); they should sit on the real features so the person is recognisable. Answer each checklist item strictly yes or no from what you see. List problems with their region. Then propose a minimal parameter patch using only the parameters provided, changing as few as possible and by small amounts. Reply with JSON only, matching the schema. No prose, no markdown.`;

export const JSON_REMINDER =
  "Your previous reply was not valid JSON. Reply again with ONLY one JSON object with keys checklist, issues, patch. No prose, no markdown, no code fences.";

/** The parameter slices the AI is allowed to change, with current values and ranges. */
export function aiEditableParams(params: Params, featuresEnabled: boolean): Record<string, { value: unknown; range?: string }> {
  const out: Record<string, { value: unknown; range?: string }> = {};
  for (const [path, spec] of Object.entries(PARAM_SPECS)) {
    if (!spec.ai) continue;
    if (!featuresEnabled && path.startsWith("features.") && path !== "features.enabled") continue;
    const value = getPath(params, path);
    let range: string | undefined;
    if (spec.kind === "number" || spec.kind === "int") range = `${spec.min}..${spec.max}`;
    else if (spec.kind === "enum" || spec.kind === "set") range = spec.values.join("|");
    else range = "true|false";
    out[path] = { value, range };
  }
  return out;
}

export function buildUserText(args: { params: Params; metrics: Metric[]; round: number; featuresEnabled: boolean }): string {
  const { params, metrics, round, featuresEnabled } = args;
  const checklist = CHECKLIST_KEYS.filter((k) => featuresEnabled || !FEATURE_CHECKLIST.includes(k));
  const metricLines = metrics
    .map((m) => `${m.key}=${m.value === null ? "n/a" : Number(m.value).toFixed(3)} (${m.pass === null ? "info" : m.pass ? "pass" : "FAIL"}, expected ${m.expected})`)
    .join("\n");
  const editable = aiEditableParams(params, featuresEnabled);
  const paramLines = Object.entries(editable)
    .map(([k, v]) => `${k} = ${JSON.stringify(v.value)}  [${v.range}]`)
    .join("\n");
  const schema = {
    checklist: Object.fromEntries(checklist.map((k) => [k, k === "glasses_included" ? "yes|no|na" : "true|false"])),
    issues: [{ type: ISSUE_TYPES.join("|"), region: REGIONS.join("|"), severity: "1|2|3" }],
    patch: { "<section>": { "<field>": "<new value>" } },
  };

  return [
    `Round ${round}.`,
    "Regions use image coordinates (left = left side of the image).",
    "Metrics:",
    metricLines,
    "Parameters you may change (dot path = current value [allowed]):",
    paramLines,
    "Hints: neck_cut.offset positive moves the cut DOWN toward the neck, negative moves it UP. combine.region_dilate grows the kept region (hair). matte.threshold higher = tighter edges. features.min_area higher removes small noisy feature lines.",
    "Reply schema (JSON only):",
    JSON.stringify(schema),
    'Patch example: {"neck_cut":{"offset":-0.04}}',
  ].join("\n");
}
