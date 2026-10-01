---
name: 20261001-copilot-int
description: Copilot WP1-4 merged and wired end to end (live wiring, default deps, mic capture in overlay, overlay actions), verified on a cloned profile with fake mic + fake OpenRouter
type: project
---

**Task:** INT: merge WP2, WP3, WP1, WP4 and wire the seams (plan.md s.11, s.19). **Branch:** livelong99/copilot-int. **Date:** 2026-10-01
**Files changed (glue):**
- `electron/copilot/{live-wiring,defaults,audio-in,e2e-hooks}.ts`: session controller + overlay host + detector + engine + recorder joined by injected deps; all real bindings in `defaults.ts`; dev-only QA hook.
- `electron/copilot/{handlers,session,overlay-host,live,types}.ts`, `electron/{main,preload}.ts`: overlay/retry/debrief/install handlers, memoised stop, STT end-of-turn + retry, epoch transcript times, replay race fix, audio IPC + media permission handler + sidecar cleanup.
- `renderer/overlay/{useMicCapture,ResizeGrip,Overlay}`, `renderer/lib/copilotDebrief.ts`, `renderer/components/copilot/wp1.tsx`, Transcription/Appearance/App/Copilot small edits.
- `scripts/copilot-int-e2e/*`, `docs/plans/interview-copilot/int-evidence/`.
**Decisions made:**
- Mic-only live: mic finals also go to the detector as interviewer candidates (no system channel yet). Alternative: detect nothing until M2.
- On-demand answer flushes the latest partial line (key is pressed before finalisation) and skips re-detecting it.
- One stop path: copilotStop -> host.stop -> hooks -> session; 'stopped' events finish bookkeeping once.
**Bugs found by e2e:** transcript times were audio-relative while question times were epoch (scoring saw no answers) -> epoch; overlay missed state replay on load -> replay on first heartbeat; debrief deep link raced screen mount -> pending page.
**State:** done; awaiting G-INT review.
**Next steps:** run `scripts/copilot-latency.mjs` with a key (G-C); install Moonshine and run the real mic once on the Mac (TCC prompt); recorded fixtures for `copilotBenchmarkStt`; live restart from overlay needs a consent path; hide live actions in Practice overlay.
