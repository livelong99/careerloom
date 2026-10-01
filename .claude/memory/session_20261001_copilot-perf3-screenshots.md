---
name: 20261001-copilot-perf3-screenshots
description: PERF-3 screenshot→vision pipeline (hide overlay, downscale 1280, JPEG q70, FIFO+sweep, budget, OCR-never-awaited) + measured table; not wired to handler/engine yet
type: project
---

**Task:** PERF-3 cheap screenshot path (M3 groundwork). **Branch:** livelong99/perf-3-screenshots. **Date:** 2026-10-01

**Files changed:**
- `electron/copilot/screenshots.ts` (+test): capture pipeline, injectable grab/overlay/perm, FIFO cap 3, 0600 files, sweep/clear, budget 20, in-flight dedupe
- `electron/copilot/vision.ts` (+test): fitLongEdge, imageTokens (anthropic/openai/gemini estimates), image_url part, needsScreenshot rule, withOcrFallback
- `scripts/copilot-shot-bench.cjs`: `npx electron` bench (synthetic frames; capture ms if Screen Recording granted)
- `docs/plans/interview-copilot/perf/screenshots.md`: table, token/cost estimates, wiring list

**Decisions made:**
- No new dependency: nativeImage via an `ImageLike` seam; tests use synthetic images. OCR fallback is a thunk (tesseract.js not installed).
- Tokens barely drop (providers cap images); real win is bytes (-55..-73 %) and latency.

**Measured:** capture p50 90 ms (1512x982@2x), resize 3-4 ms, JPEG q70 ~2 ms, ~37 KB synthetic.

**State:** `done` (pipeline), wiring pending.

**Next steps:**
- Wire handlers.ts `copilotScreenshot`, widen ProviderPrompt content to image parts in engine.ts/openrouter.ts, sweep/clear in main.ts; add a vision modality flag to recommended-models.json; run live pass for real token counts.
