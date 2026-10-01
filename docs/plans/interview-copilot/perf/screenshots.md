# PERF-3 — Screenshot path (M3 groundwork)

Status: pipeline + tests landed; **not wired** to the `copilotScreenshot` handler or the engine (shared files, see "Wiring"). Nothing runs unless the user presses Screenshot, and only when `engine.vision === 'vision'`.

## Pipeline (`electron/copilot/screenshots.ts`, `vision.ts`)
1. Gate: `engine.vision === 'vision'`, macOS Screen Recording `granted` (else `ScreenshotError('permission')`; guidance = `settingsUrl('screen')` in `audio-perms.ts`), per-session budget (default 20, `ScreenshotError('budget')`).
2. `hideOverlay()` (window **hidden**, never opacity) → 120 ms compositor wait → `desktopCapturer` thumbnail → `showOverlay()` in `finally`.
3. Downscale to long edge ≤ 1280 (never upscale), JPEG q70, in-process (`nativeImage`). **No OCR on the critical path.**
4. Retained as owner-only (0600) files in a temp dir; FIFO cap 3; `clear()` on session end/quit/panic; `sweep()` at startup removes frames from a crashed run. `latest(maxAgeMs)` serves the pre-capture cache.
5. Concurrent presses share one in-flight capture.
6. `userContentWithImage()` builds the OpenRouter `image_url` data-URL part (image first, `detail` low/high/auto). `withOcrFallback(vision, ocr, path)` starts OCR in parallel but awaits it only if the vision call throws (e.g. a non-vision model). `needsScreenshot({text,type})` is the routing rule for end-of-turn pre-capture: coding/system-design questions that point at something visible.

## Measured (this Mac, Electron 43.7.5, `npx electron scripts/copilot-shot-bench.cjs`, median of 7, **synthetic code-like frames**)
| Source | Sent | resize ms | JPEG q70 ms | q70 size | full-res q90 size | 
|---|---|---|---|---|---|
| 1080p 1x (1920×1080) | 1280×720 | 2.9 | 2.2 | 36.7 KB | 80.6 KB |
| 1440p 1x (2560×1440) | 1280×720 | 3.1 | 2.1 | 38.1 KB | 98.2 KB |
| Retina 2x (3024×1964) | 1280×831 | 4.3 | 2.3 | 38.0 KB | 135.4 KB |

- **Capture (`desktopCapturer.getSources`, 1280-wide thumbnail): p50 90 ms** on a 1512×982 @2x display (5 runs, permission already granted to the host process). So hide-wait 120 ms + capture ~90 ms + resize/encode ~7 ms ≈ **~220 ms** before the request starts; it can run during end-of-turn so it is off the answer path when pre-captured.
- Byte sizes depend on content: real screens (photos, gradients) will be larger; treat as indicative. Only the synthetic content is a limitation, timings are real.

## Token estimates per image (formulas from provider docs, **estimates, not billed numbers**)
Sources: Anthropic vision docs (28 px patches, standard tier ≤1568 long edge / ≤1568 tokens), OpenAI images-vision docs (tile models: 85 + 170/512 px tile after fit 2048 / short side 768; low detail = 85), Gemini image-understanding docs (258 per 768 tile, ≤384 px = 258). OpenRouter's multimodal page returned 404 when fetched; the `image_url` data-URL shape is the OpenAI-compatible one it documents elsewhere. **Verify with one `--live` run.**

| Source → sent | Anthropic | OpenAI tile (4o/4.1 class) | Gemini |
|---|---|---|---|
| 1080p full → 1280×720 | 1508 → 1196 | 1105 → 1105 | 1548 → 1548 |
| 1440p full → 1280×720 | 1508 → 1196 | 1105 → 1105 | 2064 → 1548 |
| Retina full → 1280×831 | 1536 → 1380 | 1105 → 1105 | 3096 → 1548 |

Honest reading: the providers already cap/downscale large images, so tokens fall only modestly (−20 % Anthropic, up to −50 % Gemini retina, 0 % OpenAI); the real wins are **request bytes (−55…−73 %)**, upload time, and avoiding provider-side resize. OpenAI mini/nano use different multipliers (docs: 2833 base + 5667/tile for 4o-mini), so do not assume 1105 for them.

Cost per image at 1280×720, using `prices.json` prompt prices: Claude Haiku 4.5 (1196 tok, $1/M) ≈ $0.0012; Claude Sonnet 5.5 ($2/M) ≈ $0.0024; Gemini 3.6 Flash (1548 tok, $0.75/M) ≈ $0.0012. Budget cap of 20 images ≈ $0.02–0.05, inside the $0.30 / 45-min target.

## Legibility trade-off
1280 px long edge at q70 is fine for editor/diagram screenshots but small terminal text on a retina display may blur. Anthropic's docs warn heavy JPEG can hurt text. If answers misread code, raise `maxLongEdge` to ~1568 (Anthropic's native cap) before touching quality.

## Wired (SS)
Wired end to end; evidence and the QA harness are in `perf/screenshots-wired/` and `scripts/copilot-screenshots-e2e/`.
- **Opt-in:** `engine.screenshots` (default off, Settings → Answer engine → "Read the screen", with the Screen Recording explainer and an "Open Screen Recording settings" button). `engine.vision: 'ocr'` stays selectable but is labelled not available (no `tesseract.js` dependency); it blocks with a note instead of silently doing nothing.
- **Provider:** `ProviderPrompt` content is `string | (TextPart | ImagePart)[]`; the image goes first, text second, only to models flagged `vision` (`recommended-models.json`, checked against OpenRouter's public `/models` `architecture.input_modalities` on 2026-10-01; the app also learns vision ids from the live list). A non-vision model raises `no_vision` with a suggested model before anything is captured or sent. Failover rotates only among vision models while an image is attached. Redaction still masks the text part (pixels cannot be redacted: that is in the explainer); the spend ceiling and fact check run as before.
- **Capture:** `copilotScreenshot` / the hotkey → gate (opt-in, mode, vision model) → capture with the overlay hidden → image + question to the engine. Progress and failures go out as `copilotScreen` events and show on the Screenshot button (Capturing / Sent / Re-answer with screen / Allow screen access / Screenshots off / OCR not available / Not a vision model / Limit reached / Capture failed), never as an error panel. Budget: 20 per session (new pipeline per session).
- **Routing:** when `route.needsScreenshot` and a vision model, permission and budget are available, the capture starts at end of turn; the answer waits at most 800 ms for it, else goes out text-only and the button offers "Re-answer with screen". Small talk and plain factual turns never capture. A screen turn does not adopt a speculative text-only request.
- **Cleanup:** frames live only in `<app temp>/careerloom-copilot-shots` (strict file names, regular files, owner-only). Swept at app start, cleared on session stop, panic, new session, `copilotDeleteSession` and `before-quit`.
- **Jev:** unchanged and off (`gate.engine` default `heuristic`); `jev-default-off.test.ts` asserts the default config never makes a Jev request and that enabling screenshots does not enable it.
- **Not measured:** real provider latency/cost for an image turn (needs a key; `scripts/copilot-latency.mjs --live` is the user's tool). Token cost per image stays the estimate table above.
