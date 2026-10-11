# Headshot Outline: Project Description

Draft v1 · October 12, 2026 · Prepared for Abhinav

## 1. Overview

Headshot Outline is an app that takes any photo of a person and returns a clean outline of the headshot: a black line on a plain white background. The outline follows the head only (face, hair, and sunglasses or other worn accessories), not the neck, clothes, or surroundings. It does not draw facial details. The result is a pure silhouette-style contour.

What makes the project different is the refinement loop. A modular algorithm produces the first outline, and then an AI model looks at the photo, the outline, and the algorithm's current settings, and suggests adjustments for that specific image. The app applies them, checks again, and repeats until the result passes a defined quality check. The algorithm adapts to each photo instead of using one fixed recipe for everyone.

## 2. Vision and Purpose

- Show people that detecting a headshot, in any pose and any photo, is a solvable and demonstrable problem.
- Make the process feel simple and a little magical: drop a photo, watch the outline draw itself, and see it correct itself when it is off.
- Prove a pattern that applies beyond this app: a modular classical algorithm tuned by an AI critic, with a measurable pass condition.

## 3. Core Experience

The interface is one screen with one main action.

1. The user drops or picks a photo.
2. The app runs the default pipeline and draws the outline live, like a pen tracing the head.
3. If checks fail, short captions show what the app is fixing (for example, "checking the neck") and the outline visibly tightens.
4. The user sees a before/after slider between the photo and the outline.
5. The user downloads the result as a PNG (transparent or white background) or an SVG.

There are no sliders, model pickers, or technical settings in the default flow. If the result is still wrong, the user can tap "include this" or "not this" on the photo to nudge it.

## 4. Scope: What Counts as the Headshot

**Included:** face, hair, ears, sunglasses or glasses, and hats if present in the photo (hat handling is configurable).

**Excluded:** neck below the chin, shoulders, clothing, hands (unless covering the face), and the background.

**Poses:** front-facing, three-quarter, and full side profile must all work. The subject does not need to look at the camera.

**Faithful outline (decided):** the app outlines only what is actually visible in the photo. It does not invent hidden parts or generate an estimated front view. If the head is cut off by the image edge, the outline stops there and is closed cleanly along the edge (or left open, as a setting).

## 5. The Algorithm: Staged and Modular

Each stage produces a soft mask (values from 0 to 1) so stages can be combined, toggled, or reordered.

1. **Person matte.** A matting or salient-object model separates the person from the background and keeps fine hair detail.
2. **Face parsing.** A parsing model labels regions (skin, hair, ears, glasses, neck, clothes). The head regions are kept; neck and clothes are dropped.
3. **Combine.** The parsing result decides what to keep, and the matte supplies precise edges inside that region.
4. **Neck cut.** A soft cut just below the chin, perpendicular to the head axis, catches any leakage into the collar or neck. This also works for profile views.
5. **Cleanup.** Keep the largest connected region, fill holes (such as sunglasses glare), refine edges, and remove background color halos.
6. **Outline extraction.** Trace the mask boundary, smooth it (spline or similar), simplify it, and render it as a uniform black stroke on white.
7. **No-ML fallback.** A classical method (such as GrabCut with a skin-color prior) covers cases where the models fail.

Stages can run all at once, one by one, or in whatever combination the current settings dictate.

## 6. AI-in-the-Loop Refinement

The main code stays small and modular. Its behavior is controlled by a structured set of parameters (a JSON object) such as which stages are on, mask thresholds, dilation amount, neck-cut height and angle, smoothing strength, and outline thickness.

**The loop:**

1. Run the pipeline with the current parameters.
2. Build a review image: the original photo with the outline overlaid in a contrasting color, side by side with the original.
3. Send the review image, the numeric diagnostics, and the current parameters to a multimodal AI model through an API.
4. The AI returns a checklist result and a small parameter patch (for example, a neck cut that is 8% too low).
5. Validate and clamp the patch, apply it, and run again.
6. Stop when the pass condition is met, when the round limit is reached, or when improvement stalls. Always keep and return the best result so far.

**Principle:** the AI tunes parameters, it does not freely rewrite code. Rewriting code is an optional fallback that must run in a sandbox, because generated code can crash or behave unpredictably.

## 7. Quality Check (Replacing a Raw "95% Confidence")

A model's self-reported confidence is not reliable, so the pass condition combines two things:

- **Checklist answered by the AI** (yes/no, concrete questions): Is all the hair inside the outline? Is any neck or collar inside? Are sunglasses or glasses included? Is any background inside? Is it a single closed outline that follows the visible head?
- **Measurable metrics computed by code:** number of connected regions, solidity of the shape, head-to-body area ratio, how closely the outline follows real image edges, and position of the neck cut relative to the chin.

The result passes when all checklist items are satisfied and metrics are in range. The UI can still show a "confidence" figure, defined as the share of checks passed, so the 95% idea is kept but made meaningful.

## 8. Handling Hard Cases

- **Full profile or detector failure:** skip face detection and estimate the head region from the top of the person matte.
- **Multiple people:** outline every head and let the user tap the one they want, or default to the largest or most central.
- **Hand over the face:** keep it if it overlaps the face region, otherwise drop it.
- **Hats, hoods, unusual hair:** configurable inclusion, and a common reason the AI loop is needed.
- **Non-photo inputs:** statues, drawings, and cartoons should work where the models allow, and failures should be reported honestly.
- **Cropped heads:** outline only the visible part, as described in the scope.

## 9. Outputs and Features

- Outline as PNG (white or transparent background) and SVG.
- Before/after slider and a live "self-drawing" outline animation.
- A visible filmstrip of refinement rounds, so users can watch the AI correct the result.
- Tap-to-nudge corrections.
- Batch mode: many photos in, a grid of outlines out.
- Possible uses: avatars and placeholders, stickers, coloring-page line art, and stencil files for laser cutting or embroidery.

## 10. Efficiency and Learning

- **Skip the AI when it is not needed.** If the local metrics already pass on the first run, no API call is made.
- **Tuning memory.** Store parameter sets that worked, grouped by image type (profile, long hair, hat, sunglasses), so similar future images start from a good preset.
- **Region-specific feedback.** The AI points to where the problem is, not just that something is wrong.

## 11. Technology and Constraints

- **AI access:** through an API, using free multimodal models (for example, free vision models available on OpenRouter, or the Gemini free tier). Free-tier limits are tight and change over time, so they must be checked when building.
- **Efficient calls:** one composite image per call, downscaled (around 512 px), with strict JSON-only replies that are parsed defensively and clamped to safe ranges.
- **Rounds:** a small cap (around 3 to 4) to stay within free limits.
- **Fallback chain:** try one provider, fall back to another, and on rate-limit or timeout errors back off once and then return the best result so far.
- **Keys:** if shipped as a single HTML app, users supply their own API key, stored only in their browser. No key is hardcoded.
- **Model quality varies:** checklist questions are kept simple and concrete because free vision models are inconsistent at open-ended judgment.
- **Benchmark mode (idea):** run the same set of test photos through each free model and pick the default model based on results.

## 12. Privacy and Honesty Principles

- Photos of faces are sensitive. Tell users when an image is being sent to an external AI service, and note that free tiers may use submitted data for training.
- Prefer on-device processing for the algorithmic stages wherever possible.
- Be honest about failure: when the app cannot reach a clean result, it says so and offers a tap-to-fix option instead of presenting a weak result as a success.

## 13. Out of Scope for Now

- Generating or estimating a front-facing view from a side photo (decided against; the outline stays faithful to the photo).
- Drawing facial features inside the outline.
- Full-body or upper-body outlines.

## 14. Success Criteria

- Works on front, three-quarter, and profile photos, with and without sunglasses, hats, and long hair.
- Most photos pass on the first run without the AI; hard photos improve visibly within the round limit.
- The final outline is a single clean closed shape with no neck, collar, or background inside it.
- The user can go from photo to downloaded outline in a few seconds, with no configuration.

## 15. Open Questions for the Technical Documentation

- Exact parameter schema (names, ranges, defaults) and how patches are validated.
- Exact checklist wording and the output format the AI must follow.
- Which models to use for matting and face parsing, and whether they run in the browser or on a server.
- Which free AI models to support first, and how limits and errors are handled per provider.
- How the tuning memory is stored and matched to new images.
- Test set: which photos to include to cover profile views, sunglasses, hats, hair types, and multi-person images.
