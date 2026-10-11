import { CHECKLIST_GOOD, CHECKLIST_KEYS, FEATURE_CHECKLIST, type Checklist, type ChecklistKey } from "../core/schema";

/** Share of checklist items that are satisfactory. Feature items count only when features are on. */
export function checklistFraction(c: Checklist, featuresEnabled: boolean): number {
  const keys = CHECKLIST_KEYS.filter((k) => featuresEnabled || !FEATURE_CHECKLIST.includes(k));
  let good = 0;
  for (const k of keys) if (k in c && CHECKLIST_GOOD[k](c[k])) good++;
  return keys.length ? good / keys.length : 0;
}

export function checklistFailures(c: Checklist, featuresEnabled: boolean): ChecklistKey[] {
  return CHECKLIST_KEYS.filter(
    (k) => (featuresEnabled || !FEATURE_CHECKLIST.includes(k)) && !(k in c && CHECKLIST_GOOD[k](c[k])),
  );
}

/** score = w_checklist × checklist_fraction + w_metrics × metric_score (§9). */
export function combinedScore(checklistFrac: number, metricScore: number, weights: { checklist: number; metrics: number }): number {
  const t = weights.checklist + weights.metrics || 1;
  return (weights.checklist * checklistFrac + weights.metrics * metricScore) / t;
}
