---
name: 20261001-copilot-perf2
description: PERF-2 Copilot latency: adaptive endpointing (real Whisper -460 ms), auto-ask policy + rate cap, heuristic/Jev gate, speculative start, per-turn routing
type: project
---

**Task:** PERF-2 endpointing, auto-ask, speculative start, routing, optional Jev gate
**Branch:** livelong99/perf-2-endpoint-auto
**Date:** 2026-10-01

**Files changed:**
- `electron/copilot/stt/{endpoint,buffer,adapter}.ts`: early final decode (`fastEndpoint`), no partials in the quiet tail
- `electron/copilot/session.ts`: duplicate-final drop, `fastEndpoint` for system channel / live only
- `electron/copilot/{auto-ask,speculate,routing}.ts`, `gate/**`: new; `detector.ts` attaches `hint`; `live-wiring.ts`, `engine.ts`, `prompts.ts` small hooks; `defaults.ts` Jev classify slot
- `config.ts`, `types.ts`: `engine.speculativeStart`, `engine.gate`, `DetectedQuestion.hint` (additive)
- `renderer/components/settings/pages/Copilot.tsx` (+registry line): "Faster answers" group
- `scripts/copilot-{endpoint-bench,gate-probe}.mjs`, `docs/plans/interview-copilot/perf-2.md` (+ measurements JSON)

**Decisions made:**
- Auto-ask only on the system channel: mic-only cannot attribute speech. Alternatives: best-effort mic-only.
- Held speculative output, 3-miss shut-off: aborted requests are not on the cost meter.
- Jev behind a flag, heuristic first, 600 ms timeout, https-only baseUrl, never when localOnly.

**Patterns used / confirmed:** TDD; fake-server tests for both Jev shapes; virtual-clock end-to-end latency test (simulated, labelled); scratch STT dir (python 3.13 venv; pyenv 3.10 breaks scipy wheels) for the real bench.

**Blockers & resolutions:**
- Fresh worktree had no node_modules -> `cp -cR` from a sibling (same lockfile).
- Early decode blocked by a running partial -> skip partials in the quiet tail when `fastEndpoint`.

**State:** done (live OpenRouter/Jev numbers pending a key)

**Next steps:**
- Run `scripts/copilot-gate-probe.mjs --live` and `scripts/copilot-latency.mjs` with a key; decide on turning speculation / Jev on.
- Surface `wiring.metrics().speculation` in the PERF-1 trace summary after merge.
