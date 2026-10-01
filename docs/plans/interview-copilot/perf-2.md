# PERF-2: endpointing, auto-ask, speculative start, routing, optional Jev gate

Branch `livelong99/perf-2-endpoint-auto`. Everything below is off or inert by default except the endpointing change (interviewer channel and live mode only).

## What shipped
| Area | Files | Default |
|---|---|---|
| Adaptive end-of-turn | `stt/endpoint.ts`, `stt/buffer.ts` (early final decode after 160-250 ms of quiet; a finished sentence ends the turn, otherwise the full `endSilenceMs` applies and reuses the early decode), `session.ts` passes `fastEndpoint` for the system channel and live mode only | on for interviewer channel / live; never for practice answers |
| Duplicate finals | `session.ts` drops a final equal to (or contained in) the previous one from the same source within 3 s of audio | on |
| Auto-ask policy | `auto-ask.ts` (interviewer channel only, finished thought, not small talk, 2.5 s gap and 6 per minute), wired in `live-wiring.ts` | `engine.autoAnswer` stays **off** |
| Gate | `gate/{types,heuristic,jev,pipeline,classify,configured}.ts`: heuristic first, model only for ambiguous interviewer lines, 600 ms hard timeout, any failure falls back to the heuristic, never on the manual path | `engine.gate.engine = 'heuristic'` |
| Speculative start | `speculate.ts` (held output, word-distance match <= 20 %, 3 misses in a row switch it off for the session) | `engine.speculativeStart = false` |
| Routing | `routing.ts` (kind, tier, token scale, brief variant, skip small talk when auto-asked, needs_screenshot flag), `engine.ts` accepts `route` | always on (pure) |
| Settings | `renderer/components/settings/pages/Copilot.tsx` "Faster answers" group | n/a |

## Measured (real) and simulated
- **Real, local, Whisper small (MLX), S2 bench fixture (4 synthetic sentences), end of speech -> final, 8 samples per mode, memory free 32-46 %**: baseline p50 652 ms (p95 728), adaptive p50 195 ms (p95 281). Identical transcripts. Absolute values include the TTS tail inside the fixture's `endMs`, so read the **delta (about 460 ms)**. `docs/plans/interview-copilot/measurements/perf2-endpoint-*.json`, reproduce with `scripts/copilot-endpoint-bench.mjs` (needs a scratch `--stt-dir`; never the real one).
- **Simulated (injected profiles, virtual clock; NOT measurements of any real model)** in `latency-e2e.test.ts`: decode 400 ms + TTFT 700 ms -> end-of-speech to first visible line 1700 ms baseline, 1300 ms with fast endpoint (+-100 ms frame quantisation). Streaming-engine model with the final 700 ms after speech: 1300 ms without speculation, 700 ms on a hit, 1300 ms on a miss.
- **Not measured**: any real OpenRouter / Jev call (no key). `scripts/copilot-gate-probe.mjs --live` logs Jev RTT p50/p95 for OpenRouter (`/v1/systemone`, `/alpha/decisions`) vs direct; `scripts/copilot-latency.mjs` (existing) measures answer TTFT with a key.

## Routing label quality (heuristics; `routing.test.ts` prints it)
Detector fixture (in-sample, the rules were tuned on it): coding / system-design / behavioural / factual all P = R = 1.0 (n = 5 / 5 / 13 / 15). **Fresh phrasings (out of sample, n = 18)**: accuracy 0.94; system-design recall 0.75, factual precision 0.83. Small talk P = 1.0, R = 1.0 (n = 8, author-written); needs_screenshot P = R = 1.0 (n = 4 + 4). Small samples: treat as smoke, not as a benchmark.

## Jev endpoint (verified against docs 2026-10-01, no live call)
Both documented shapes parse the same `answers`. `/v1/systemone` (docs.typesafe.ai/api.md): `state` is a **string**, model `jev-latest` there / `typesafe/jev-1.13` on OpenRouter. `/api/alpha/decisions` (openrouter.ai/docs/guides/community/jev-tutorial): `state` is an **object**, response adds `id`/`provider`, `usage.cost`. `baseUrl` (https only) and `endpoint` are config; default OpenRouter + `systemone` (the SDK path). Transcript text appears only in `state`; errors carry the HTTP status only. Not sent when `privacy.localOnly`.

## Decisions to confirm
1. **Auto-ask now needs the system channel.** Mic-only live hears both voices, so it cannot tell the interviewer; there auto-ask stays off (the question card and the hotkey still work). System audio is "coming soon", so auto-ask has no effect until then. Relax in `auto-ask.ts` if you prefer a best-effort mic-only mode.
2. Aborted speculative requests are not on the engine's cost meter. Mitigation: 3-miss shut-off + auto-ask rate cap; wasted tokens are an estimate (chars / 4).
3. Streaming Moonshine keeps its own endpointing: `fastEndpoint` only affects the chunked (Whisper) adapter. Speculation is the lever there.

## Merged with PERF-1 and PERF-3
- **Trace (PERF-1) covers PERF-2 paths:** `TraceMarks.releasedAt` (a held speculative answer is visible only once released: `endToSay` = later of first say and release), `StageMs.turn = { kind, tier, auto, spec: 'hit'|'miss'|null, gate: 'heuristic'|'jev'|null, gateMs }` (closed-set labels and numbers, no text), `TraceSummary.speculation = { hits, misses }`. The engine now shares `req.marks` / `req.info` with the caller and, for held requests, writes the record on `req.afterRelease`. The record's `questionId` for a speculative turn is the speculative id (`qs…`); suggestions carry the final id.
- **Screenshots (PERF-3):** one rule: `heuristicHint().needsScreenshot` = `vision.needsScreenshot` OR the wider phrase list; it surfaces as `route.needsScreenshot`. **Still unwired (needs the shared files, as PERF-3 listed):** `handlers.ts` `copilotScreenshot` -> `pipeline.capture()` + engine call; widen `ProviderPrompt.messages[].content` to `string | parts[]` and pick a vision model; `main.ts` `sweep()` / `clear()`; consuming `route.needsScreenshot` to pre-capture at end of turn once the pipeline is instantiated.
