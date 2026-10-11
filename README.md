# Headshot Outline

Turn any photo of a person into a clean **head outline** — plus optional **facial-feature line art** — as black lines on white. Everything runs **in the browser**: segmentation models run on-device in a Web Worker, and an optional multimodal **AI critic** (any provider, your own key) reviews the result and tunes the algorithm's parameters until it passes a measurable quality check.

Built with Next.js 15 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui (Base UI), lucide-react, framer-motion, Zustand, `@huggingface/transformers` v3 and `@mediapipe/tasks-vision`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest unit tests
npm run build      # production build (lint + type-check)
```

Node 20+ (tested on Node 22). No server-side keys or environment variables are needed.

> **First run downloads the models** into the browser cache: MODNet matte ≈ 26 MB, face parsing (SegFormer, q8) ≈ 89 MB, MediaPipe Face Landmarker ≈ 4 MB, plus the ONNX Runtime WASM (~21 MB, served by the app). RMBG-1.4 (≈ 44–88 MB) only downloads if MODNet fails. Later runs are offline-fast.

## Features

**Studio (`/`)** — one screen, one primary action.
- Drop zone: pick, drag-and-drop, or paste an image (EXIF orientation respected).
- Visible status: 4-step stepper, model-download progress, live captions per refinement round.
- Live self-drawing SVG: the outline draws in first, then the facial features.
- Before/after slider (photo ↔ line art) and a confidence ring (score = 0.6 × checklist + 0.4 × metrics).
- Refinement filmstrip: a thumbnail per round with score and caption ("trimming the neck"…); tap to view any round.
- **Detail** toggle: Outline / Features / Detailed — reruns only the feature stage locally.
- **Fix** (tap-to-nudge): "Include this" / "Not this" brush with undo/clear; reruns locally from the Combine stage, no AI call.
- **Details** drawer: status, metrics with pass/fail, AI checklist and issues, parameter diff per round (incl. validator and oscillation-guard actions), decontaminated head cut-out.
- Export at the **original resolution**: PNG (white), PNG (transparent), SVG (separate `outline` and `features` groups).
- Privacy notice before the first AI call (photo leaves the device; free tiers may train on data). Honest *done*, *best-effort* and *error* states.
- Light/dark theme, single violet accent, WCAG AA contrast, ≥ 44 px touch targets, visible focus rings, `prefers-reduced-motion` respected, mobile-first.

**Settings (`/settings`)** — every value is read from one persisted Zustand store at call time.
- **AI providers**: add any number, any key. Presets: OpenAI, Google Gemini (generateContent), Anthropic (messages, direct-browser header), OpenRouter, Groq, Mistral, Together, xAI, Ollama, LM Studio, Custom OpenAI-compatible. Per provider: name, API format, base URL, masked key with show/hide, model with **Fetch models**, enable toggle, fallback order (drag or up/down).
- Optional request parameters (unset = not sent): temperature, max tokens, top_p, top_k, frequency/presence penalty, seed, stop sequences, JSON mode, timeout, retries, backoff; custom headers; **custom request body JSON deep-merged last**; editable system prompt with reset; review image max width and JPEG quality.
- Live **request preview** (exact URL, headers with key redacted, body) and **Test connection** with latency and readable errors (auth, CORS/network, 429, model not found, timeout).
- **Loop**: pass threshold (95 %), max rounds (4), skip AI when metrics pass, always run critic once, score weights, stall rounds (2), tuning memory on/off; inference device (auto/WebGPU/WASM), working resolution, MediaPipe landmarks.
- **Algorithm**: form for the whole parameter schema (sliders bounded by validator ranges, AI-editable fields marked) plus a raw JSON editor that validates/clamps.
- **Data**: tuning-memory list (IndexedDB) with delete/clear, export/import settings (keys excluded by default), reset all.

## How it works

```
photo → ImageIO (≈1024 px working copy)
      → [worker] Matte (MODNet → RMBG-1.4)  +  Face parsing (CelebAMask-HQ, crop-refined)
      → Combine → Neck cut (PCA head axis) → nudges → Cleanup → Outline → Features → Evaluate
      → Orchestrator: PASS? else Composer → CriticClient (fallback chain) → Validator → Oscillation guard → APPLY → RUN …
```

- The pipeline is deterministic and fully controlled by one parameter object (`src/lib/core/schema.ts`). The AI only proposes patches; patches are validated (unknown keys dropped, numbers clamped, wrong types ignored, allow-lists enforced) and never executed.
- `StageCache` keys each stage by its parameter slice, so a neck-cut change reruns only neck cut → cleanup → outline → features.
- Terminal states: `PASS`, `MAX_ROUNDS`, `STALLED`, `CRITIC_ERROR`, `METRICS_ONLY`; the best-scoring round is always returned.
- Retry policy: 429/timeout → backoff and retry (configurable), malformed JSON → one stricter retry, auth error → stop immediately; then the next provider.
- Tuning memory stores parameters (never images) by image class (pose, hair length, accessories) in IndexedDB.

Facial features (scope extension): see [`docs/features-extension.md`](docs/features-extension.md).

### Project layout

```
src/app/                    layout, Studio page, /settings page
src/components/studio/      drop zone, outline view (slider/draw/nudge), filmstrip, ring, details sheet, privacy dialog
src/components/settings/    providers, provider card (preview/test), loop, algorithm, data panels
src/components/ui/          shadcn/ui components (Base UI)
src/lib/core/               schema, params, validator, mask math, head axis, stage cache
src/lib/pipeline/           matte, parsing, geometry, combine, neckcut, cleanup, outline, features, fallback, landmarks, run
src/lib/eval/               metrics, score
src/lib/critic/             composer, prompt, request builder, client, presets, adapters/{openai,gemini,anthropic}
src/lib/orchestrator/       loop, oscillation guard
src/lib/memory/             tuning memory (IndexedDB)
src/lib/store/              settings store (Zustand + localStorage)
src/lib/workers/            inference.worker.ts, client, protocol
src/lib/ui/                 image IO, export
tests/unit/                 validator, request builder, oscillation guard, pipeline geometry, runner (synthetic)
docs/                       design system, feature extension, original specs
```

## Deploy to Vercel

1. Push this repo to GitHub (private is fine).
2. In Vercel: **Add New → Project → Import** the repository. Framework preset: **Next.js** (auto-detected). Build command `npm run build`, output `.next` — the defaults.
3. No environment variables are required (users paste their own AI keys in Settings; keys stay in their browser).
4. Deploy. Every page is static; all processing happens client-side.

CLI alternative:

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

## Known limitations

- First use downloads ~120–140 MB of models; low-end phones may be slow on WASM (WebGPU is used when available).
- Some providers block direct browser calls (CORS). Gemini, OpenAI, OpenRouter, Groq, Mistral and Anthropic (with its direct-browser header) generally allow them; local servers (Ollama, LM Studio) need CORS enabled. Use OpenRouter or a custom proxy otherwise.
- Face parsing is weaker on extreme profiles and heavy occlusion; profile neck cuts fall back to a fixed fraction of head height.
- Multiple people: the largest head is kept; picking another head is done with the include/exclude brush (no dedicated head picker yet).
- Batch mode, benchmark mode and the sandboxed "AI rewrites code" fallback (all optional/open in the spec) are not implemented.
- Thresholds are starting values and need tuning on a real test set.
