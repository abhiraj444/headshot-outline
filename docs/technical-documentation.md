# Headshot Outline: Technical Documentation

Draft v1 · October 12, 2026 · Companion to the Project Description

## 1. Purpose and Scope

This document describes how Headshot Outline is built: the modules, the data each one exchanges, the parameter schema, the AI refinement protocol, error handling, and testing. Numbers given as defaults and thresholds are starting values to be tuned against the test set, not final truths. Anything marked **(open)** needs a decision before implementation.

## 2. System Overview

The app is a client-side pipeline with one optional remote dependency (the AI critic).

1. **Input:** a photo supplied by the user.
2. **Pipeline:** a staged algorithm turns the photo into a head mask, then into an outline.
3. **Evaluator:** local code computes metrics from the mask and outline.
4. **Critic (remote, optional):** a multimodal model reviews an overlay image and returns a checklist plus a small parameter patch.
5. **Orchestrator:** a loop controller applies validated patches and reruns until a pass, a round limit, a stall, or an error.
6. **Output:** the best outline found, as PNG and SVG.

The design rule that shapes everything else: **the pipeline is deterministic and fully controlled by one parameter object. The AI only proposes changes to that object.**

## 3. Module Breakdown

- **ImageIO:** load, orient (EXIF), downscale for processing, keep the original at full size for export.
- **Stage modules:** Matte, Parsing, Combine, NeckCut, Cleanup, Outline. Each is a pure function from inputs plus its own parameter slice to a mask or contour.
- **StageCache:** stores each stage's output keyed by a hash of the inputs and that stage's parameter slice, so changing a late-stage parameter does not rerun earlier stages.
- **Evaluator:** computes the metrics in section 7.
- **Composer:** builds the review image sent to the AI.
- **CriticClient:** provider adapters, retries, fallback chain.
- **Validator:** checks and clamps the AI's reply against the schema.
- **Orchestrator:** the loop state machine in section 9.
- **TuningMemory:** stores parameter sets that worked, by image class (section 11).
- **UI layer:** drop zone, live drawing animation, refinement filmstrip, before/after slider, tap-to-nudge, export.

All heavy work (model inference, mask math) runs in a Web Worker so the interface stays responsive. **(open)** whether inference runs in the browser (ONNX Runtime Web) or on a small server.

## 4. Data Model

**Mask:** a single-channel float array, values 0 to 1, same size as the working image.

**Working image:** the photo downscaled so the long side is about 1024 px. All geometric parameters are expressed relative to head height H (see below), so results do not depend on resolution.

**Head height H:** estimated as the vertical extent of the largest head-class region from the parsing stage, or, if parsing fails, from the top blob of the person matte (about the top one-seventh of the person's height). Measured along the head axis, not the image vertical.

**Head axis:** a unit vector from the chin region toward the top of the hair. It is estimated from the parsing mask's principal axis, refined by landmarks when available. It is what makes the neck cut work on tilted heads and profiles.

**Contour:** an ordered list of points, closed or open, in working-image coordinates.

**RunResult:** `{ params, masks, contour, metrics, score, round }`.

## 5. Parameter Schema

The full behavior of the pipeline is one JSON object. Version it, so old saved presets keep working.

```json
{
  "schema_version": 1,
  "matte": {
    "enabled": true,
    "model": "birefnet",
    "threshold": 0.5
  },
  "parsing": {
    "enabled": true,
    "keep": ["skin", "nose", "eyes", "brows", "ears", "glasses", "lips", "hair"],
    "include_hat": false
  },
  "combine": {
    "region_dilate": 0.03
  },
  "neck_cut": {
    "enabled": true,
    "offset": 0.0,
    "angle_deg": 0,
    "feather": 0.03
  },
  "cleanup": {
    "keep_largest": true,
    "fill_holes": true,
    "close_radius": 0.015,
    "guided_filter_radius": 0.01,
    "decontaminate_edges": true
  },
  "outline": {
    "smoothing": 0.5,
    "simplify_epsilon": 0.004,
    "stroke_px": 4,
    "close_at_image_edge": true
  },
  "fallback": {
    "use_grabcut": false
  }
}
```

**Ranges the validator enforces (initial values):**

- `matte.threshold`: 0.2 to 0.8
- `combine.region_dilate`: 0 to 0.08 (fraction of H)
- `neck_cut.offset`: -0.15 to 0.15 (fraction of H; positive moves the cut down, toward the neck)
- `neck_cut.angle_deg`: -30 to 30, relative to the estimated perpendicular of the head axis
- `neck_cut.feather`: 0.01 to 0.08
- `cleanup.close_radius`: 0 to 0.04
- `cleanup.guided_filter_radius`: 0 to 0.03
- `outline.smoothing`: 0 to 1
- `outline.simplify_epsilon`: 0.001 to 0.012
- `outline.stroke_px`: 1 to 12 (output setting; the AI never changes it)
- `model` and `keep` values must come from fixed allow-lists.

Any key not in the schema is dropped. Any out-of-range number is clamped to the range. Any wrong type causes that single field to be ignored.

## 6. Pipeline Stages in Detail

**6.1 Matte.** Run a matting or salient-object model (candidates: BiRefNet or RMBG-class, MODNet, U²-Net). Output is a soft alpha for the whole person. Threshold is applied only where a hard mask is needed later.

**6.2 Parsing.** Run a face-parsing model (BiSeNet-style, trained on CelebAMask-HQ). Union the classes listed in `parsing.keep`. Neck and clothing classes are never kept. Parsing models are weaker on extreme profiles and heavy occlusion, which is why the neck cut and fallback exist.

**6.3 Combine.** `region = dilate(union(keep), region_dilate × H)`, then `alpha = matte × region`. Parsing decides what is allowed; the matte supplies fine edges and hair strands inside that region.

**6.4 Neck cut.** Place a line perpendicular to the head axis just below the lowest chin point, shifted by `offset × H` and rotated by `angle_deg`. Multiply the alpha by a soft step across the line, with transition width `feather × H`. In profile, where the chin point is unreliable, anchor the line to a fixed fraction of H below the top of the hair. **(open)** exact fallback fraction.

**6.5 Cleanup.** Keep the largest connected component. Fill holes (for example, sunglasses glare) using a morphological close with radius `close_radius × H`, followed by hole fill. Refine edges with a guided filter using the photo as guide. Optionally estimate the foreground color near edges to remove background halos (this affects only the preview, not the outline).

**6.6 Outline extraction.**

1. Threshold the final alpha at 0.5.
2. Trace the boundary (marching squares or Moore-neighbor tracing).
3. If the shape touches the image border and `close_at_image_edge` is true, clip it to the image rectangle and close along the edge. Otherwise leave the contour open at the border.
4. Smooth with a spline (Chaikin or Catmull-Rom), strength set by `smoothing`.
5. Simplify with Douglas-Peucker using `simplify_epsilon × H`.
6. Render as a uniform black stroke on white, and emit an SVG path.

**6.7 Fallback.** If matte or parsing fails, or the metrics are far out of range on the first run, set `use_grabcut`. Run GrabCut on a rectangle around the estimated head, seeding skin-colored pixels (sampled in YCrCb) as definite foreground and the image border as definite background. Expect weaker hair results.

## 7. Evaluator and Metrics

The Evaluator produces numbers from the final mask and outline. Thresholds below are starting values.

- **components:** number of connected regions after cleanup. Must be 1.
- **solidity:** mask area divided by convex hull area. Expected range about 0.80 to 0.98. Very low values suggest fragments or leakage; values near 1.0 suggest a blob with lost hair detail.
- **head\_area\_ratio:** mask area divided by person-matte area. Expected range about 0.08 to 0.45. Higher suggests torso leakage; much lower suggests missing parts.
- **edge\_agreement:** the average image-gradient magnitude along the contour, normalized by the image's typical gradient. Higher means the outline sits on real edges. Compare against a floor value tuned on the test set.
- **neck\_position:** distance from the neck line to the chin, in fractions of H. Expected within about -0.05 to 0.15.
- **border\_contact:** fraction of the contour on the image border (informational, used to explain cropped heads).

The Evaluator returns each metric, a pass or fail per metric, and a single `metric_score` between 0 and 1 (the share of metrics in range, optionally weighted).

## 8. The AI Critic

**8.1 Review image.** The Composer builds one image: the original on the left, the same photo with the outline drawn in red (about 2 px at working size) on the right. Downscale so the combined width is about 768 to 1024 px, and encode as JPEG at quality about 0.8. One image per call keeps token use and request count low.

**8.2 Inputs sent.** The review image, the metrics with their pass or fail flags, the current parameters (only the slices the AI is allowed to change), and the round number.

**8.3 Required reply (JSON only).**

```json
{
  "checklist": {
    "hair_fully_inside": true,
    "neck_or_collar_inside": false,
    "glasses_included": "yes",
    "background_inside": false,
    "single_closed_outline": true,
    "follows_visible_head": true
  },
  "issues": [
    {
      "type": "neck_leak",
      "region": "bottom",
      "severity": 2
    }
  ],
  "patch": {
    "neck_cut": { "offset": -0.06 }
  }
}
```

`glasses_included` may be `yes`, `no`, or `na`. `region` values: `top`, `bottom`, `left`, `right`, `top_left`, `top_right`, `bottom_left`, `bottom_right`, `inside`, using image coordinates (left means left in the image, not the person's left). `issues.type` comes from a fixed list: `neck_leak`, `collar_leak`, `hair_cut`, `background_leak`, `fragment`, `hole`, `glasses_missing`, `hat_issue`, `other`.

**8.4 Prompt draft (system message).**

> You review a head outline. The image shows the original photo on the left and the same photo with a red outline on the right. The outline should follow only the visible head: face, hair, ears, and glasses or sunglasses if worn. It must not include the neck below the chin, collar, shoulders, or background. Answer each checklist item strictly yes or no from what you see. List problems with their region. Then propose a minimal parameter patch using only the parameters provided, changing as few as possible and by small amounts. Reply with JSON only, matching the schema. No prose, no markdown.

Weaker free models need short, concrete questions. Keep the prompt as plain as possible and test it per model. **(open)** final wording after benchmark runs.

**8.5 Parsing the reply.** Strip code fences if present, parse JSON, and run the Validator. If parsing fails, count the round as a critic failure, retry once with a reminder to output JSON only, then stop the loop and return the best result so far.

## 9. Orchestration Loop

**States:** `INIT` → `RUN` → `EVALUATE` → (`PASS` or `CRITIQUE`) → `VALIDATE` → `APPLY` → `RUN`.

**Terminal states:** `PASS`, `MAX_ROUNDS`, `STALLED`, `CRITIC_ERROR`. All terminal states return the best result seen.

**Steps:**

1. **INIT:** choose starting parameters from TuningMemory if a close match exists, otherwise defaults.
2. **RUN:** execute the pipeline, reusing cached stage outputs where parameter slices are unchanged.
3. **EVALUATE:** compute metrics. If all metrics pass, **optionally** skip the critic and finish (round-0 shortcut). **(open)** whether to always run the critic once, for safety, or trust the metrics alone.
4. **CRITIQUE:** build the review image, call the critic, parse the reply.
5. **PASS check:** if every checklist item is satisfactory and all metrics pass, finish.
6. **VALIDATE and APPLY:** validate the patch, merge it into the parameters, and go to RUN.

**Scoring and best-so-far:** `score = 0.6 × checklist_fraction + 0.4 × metric_score`. `checklist_fraction` is the share of checklist items that are satisfactory. This same number is the "confidence" shown in the UI. Keep the highest-scoring RunResult.

**Stop conditions:**

- `MAX_ROUNDS`: default 4 rounds of critic calls.
- `STALLED`: the patch is empty, produces parameters identical to the previous round, or the score fails to improve for 2 consecutive rounds.
- `CRITIC_ERROR`: provider failure after fallback (section 10).

**Oscillation guard:** if a parameter would be pushed back toward a value used in an earlier round, halve the step. If it keeps flipping, freeze that parameter for the rest of the run.

## 10. Provider Layer

The CriticClient exposes one function: `askCritic({ image, diagnostics, params, round })`, returning the parsed reply or an error.

**Adapters:**

- **Gemini adapter:** use the multimodal generate-content API with a JSON response mode and a response schema where supported.
- **OpenRouter adapter:** use a free multimodal model through the chat-completions style API. Not every model supports structured output, so rely on the prompt plus defensive parsing, and use a JSON response format only when the chosen model supports it.

**Fallback chain:** primary provider → secondary provider → return best result so far.

**Retry policy:**

- Rate limit (HTTP 429) or timeout: wait with backoff once, retry once, then move to the next provider.
- Malformed output: one retry with a stricter reminder, then treat as a critic failure.
- Authentication error: stop immediately and ask the user to check their key.

**Request budget:** a counter per provider per session, so the app can warn before free limits are hit. Free-tier limits change often, so read them from provider documentation at build time. **(open)** whether to expose a "daily budget" setting.

**Keys:** in a single-page build the user pastes their own key. It is stored only in the browser's local storage, never sent anywhere except the provider's own endpoint. Do not embed any developer key in the page.

**Benchmark mode:** run a fixed set of photos through each configured model with the same prompt and record pass rate, average rounds, and invalid-reply rate. Use the results to choose the default model.

## 11. Tuning Memory

**Purpose:** start similar future photos from parameters that already worked.

**Stored per entry (no images):** `{ image_class, params, final_score, rounds_needed, schema_version, timestamp }`.

**Image class:** a small descriptor such as pose (`front`, `three_quarter`, `profile`), hair length (`short`, `medium`, `long`, `none`), and accessories (`sunglasses`, `glasses`, `hat`, `none`). These can come from the parsing output and simple geometry, or from one extra field in the critic's first reply. **(open)** which source is more reliable.

**Lookup:** exact class match first, then nearest by number of matching fields. Use an entry only if its `final_score` was a pass.

**Storage:** the browser's IndexedDB. Entries are small and can be cleared by the user in one action.

## 12. UI Behavior and States

**States:** `idle`, `loading_models`, `processing`, `refining` (with round counter), `done`, `done_best_effort`, `error`.

- **Live drawing:** animate the contour as a stroke drawing in over about 1 to 2 seconds after each run.
- **Refinement filmstrip:** keep a thumbnail per round and a one-line caption derived from the top issue (for example, "trimming the neck").
- **Before/after slider:** photo versus outline.
- **Tap-to-nudge:** a tap on the photo adds an include or exclude hint. Convert it to a local mask edit (a small dilated region added to or removed from the alpha before cleanup) and rerun from the Combine stage. It never requires an AI call.
- **Best-effort state:** if the loop ends without a pass, show the best result with a plain message and the tap-to-fix option.
- **Export:** PNG (white or transparent) and SVG, at the original image's resolution.

## 13. Error Handling Summary

- **No person detected:** show a clear message; do not run the loop.
- **Model fails to load:** use the fallback pipeline; tell the user quality may be lower.
- **Multiple heads:** outline all; the default selection is the largest or most central, and the user can tap another.
- **Empty or tiny mask:** treat as pipeline failure, enable `use_grabcut`, rerun once.
- **Critic unavailable:** return the local result with the metrics-only score and label it clearly.
- **Out-of-memory on large images:** reduce working resolution and retry.

## 14. Security and Privacy

- Treat all AI output as untrusted data. It is parsed as JSON, validated, and clamped. It is never executed.
- The optional "AI rewrites code" fallback, if ever built, must run only inside a sandboxed worker or iframe with no network and no storage access, and should be disabled by default. **(open)** whether to include it at all.
- Photos sent to a provider leave the device. Show a notice before the first call, and note that free tiers may use submitted data for training.
- Do the algorithmic stages on the device wherever possible.
- Tuning memory stores parameters only, never images.

## 15. Performance Notes

- Run model inference in a Web Worker, using WebGL or WASM backends through the inference runtime.
- Cache stage outputs (StageCache) so a neck-cut change reruns only the neck cut, cleanup, and outline stages.
- Process at about 1024 px on the long side; export upscales the contour (vector) rather than the mask.
- Lazy-load models, and show progress during the first run.
- Target: local pipeline run in a couple of seconds on a mid-range phone, plus one network round trip per critic round. **(open)** confirm on real devices.

## 16. Suggested Code Structure

```
/src
  /pipeline      matte.js  parsing.js  combine.js  neckcut.js  cleanup.js  outline.js  fallback.js
  /core          params.js  schema.js  validator.js  stagecache.js  headaxis.js
  /eval          metrics.js  score.js
  /critic        composer.js  prompt.js  client.js  adapters/gemini.js  adapters/openrouter.js
  /orchestrator  loop.js  oscillation.js
  /memory        tuning.js
  /ui            dropzone.js  drawing.js  filmstrip.js  slider.js  nudge.js  export.js
  /workers       inference.worker.js
/tests           fixtures/  unit/  benchmark/
```

## 17. Testing Plan

**Test set (target 40 or more photos),** covering: front, three-quarter, and full profile; sunglasses and clear glasses; hats and hoods; long, short, curly, and no hair; cropped heads; hands near the face; two or more people; busy backgrounds and low contrast backgrounds; non-photo inputs (statue, painting, cartoon).

**Ground truth:** a hand-made head mask for each photo, used only for evaluation.

**Measurements:**

- IoU between the final mask and the ground truth.
- Pass rate at round 0 (no AI), and pass rate after refinement.
- Average rounds to pass, and the failure rate at the round limit.
- Invalid-reply rate and error rate per provider and model.
- Agreement between the AI checklist and the ground-truth-based metrics (to learn how far the critic can be trusted).

**Unit tests:** the validator (clamping, unknown keys, wrong types), the stage cache (correct invalidation), the oscillation guard, the head-axis estimate on rotated synthetic masks, and contour closing at the image edge.

**Regression:** keep the benchmark results per version, so a new prompt or model can be compared with the old one.

## 18. Open Decisions

- Browser inference versus server inference.
- Which matting and parsing models to ship first, given size and licensing.
- Whether the critic always runs once, or only when metrics fail.
- Final checklist wording and per-model prompt variants.
- Neck cut fallback fraction for profile views.
- Source of the image class used by tuning memory.
- Whether to include the sandboxed code-rewrite fallback.
- Default round limit and request budget policy.
