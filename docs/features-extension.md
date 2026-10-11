# Scope extension: facial-feature line art

_Overrides the Project Description's "does not draw facial details" rule (§1, §13) at the owner's request, October 2026._

Besides the outer head outline, the app draws internal facial features as clean black line art on white, so the person stays recognisable.

## Pipeline stage `features` (runs after Cleanup)

Source: the face-parsing label map (CelebAMask-HQ classes from `jonathandinu/face-parsing`). Every region is traced with marching squares, smoothed (moving average + Chaikin), simplified (Douglas–Peucker, ε = `outline.simplify_epsilon × H × 0.5`) and **clipped inside the head mask**. Regions smaller than `features.min_area × H²` are dropped.

| Feature | How it is drawn |
| --- | --- |
| Brows | contours of `l_brow`, `r_brow` |
| Eyes | contours of `l_eye`, `r_eye` |
| Glasses / sunglasses | `eye_g` outer frame **and** inner loops (lens shapes) |
| Nose | `nose` contour trimmed to the lower 45 % along the head axis (nostril line, not a closed blob); in profile also the side edge where the nose meets the background |
| Lips | `u_lip`, `l_lip` contours + the mouth line (`u_lip` boundary touching `l_lip`/`mouth`) |
| Ears | `l_ear`, `r_ear` outer contour; in *detailed* mode an inner ear curve (eroded ear, outer half) |
| Hairline | boundary of `skin` touching `hair` |
| Jaw / chin (optional) | boundary of `skin` touching `neck`/`neck_l` |
| Beard edge (optional) | `hair` pixels below the nose, boundary against skin/lips |

Detail levels: `outline_only` (no features), `minimal` (brows, eyes, nose base, mouth line), `standard` (all enabled `include.*`), `detailed` (+ ear inner curves, glasses lenses, irises from landmarks).

### Optional MediaPipe refinement
When a face is detected by MediaPipe Face Landmarker (478 landmarks, `@mediapipe/tasks-vision`) and |yaw| < 50°, landmark polylines replace the parsed eyes, brows, lips (outer + inner) and nose base. Profiles fall back to parsing-only lines. Toggle in Settings → Loop → "MediaPipe landmarks for features".

## Parameter schema addition

```json
"features": {
  "enabled": true,
  "detail": "standard",          // outline_only | minimal | standard | detailed
  "include": { "brows": true, "eyes": true, "glasses": true, "nose": true, "lips": true,
               "ears": true, "hairline": true, "jaw": false, "beard": false },
  "min_area": 0.002,             // fraction of H², validator range 0.0002–0.02
  "stroke_ratio": 0.6,           // feature stroke ÷ outer stroke, 0.2–1 (output only, AI never changes it)
  "smoothing": 0.5               // 0–1
}
```
`schema_version` is now **2**; older saved settings are re-validated and get these defaults.

## Critic changes
- Checklist adds `eyes_correct`, `brows_correct`, `nose_correct`, `lips_correct`, `ears_correct`, `recognisable` (yes/no). They only count toward the checklist fraction when features are on.
- New issue types: `feature_missing`, `feature_misplaced`, `feature_noise`.
- The AI may patch `features.*` except `stroke_ratio`.

## Evaluator additions
- `features_present`: share of expected features found for the estimated pose (front/three-quarter: brows, eyes, nose, lips; profile: eyes, nose, lips) — pass ≥ 75 %.
- `feature_symmetry` (frontal only): eye positions mirrored about the face midline — pass ≥ 0.75.
- `features_outside`: share of feature points that fell outside the head mask before clipping — pass ≤ 5 %.

## UI / export
- Studio quick toggle **Detail: Outline / Features / Detailed** (the only visible control besides export). Changing it reruns only the features stage locally.
- The outline draws itself first, then the features.
- SVG export has separate `<g id="outline">` and `<g id="features">` groups (each feature in its own `<g id="feature-…">`).
