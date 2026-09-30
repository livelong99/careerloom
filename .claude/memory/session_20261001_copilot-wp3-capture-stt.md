---
name: 20261001-copilot-wp3-capture-stt
description: Copilot WP3 — mic capture pipeline, Moonshine sidecar STT adapter + install flow, session controller, silent-source detector, mac entitlements, S1 system-audio spike (GO via loopback)
type: project
---

**Task:** Interview Copilot WP3 (capture + STT, mic first) + spike S1; S2 bake-off not finished, so Moonshine is implemented with a switchable default
**Branch:** livelong99/copilot-wp3-capture-stt
**Date:** 2026-10-01

**Files changed:**
- `electron/copilot/stt/{adapter,fake,ring,merge,framing,bench}.ts`: adapter contract + emitter, fixture replay, 10 s replay ring, Open-Cluely merge port, sidecar wire format, p50/RTF summary
- `electron/copilot/stt/{sidecar,sidecar-script,moonshine,engines,runtime,install}.ts`: long-lived python sidecar (restart once + ring replay, graceful stop), embedded script, installer (venv + `moonshine-voice==0.1.5` + model + selftest into `~/.careerloom/stt`, `CAREERLOOM_STT_DIR` override)
- `electron/copilot/{session,source-health,capabilities,audio-perms}.ts`: session controller (idle→armed→listening→stopped), silent detector (2.5 s), darwin/arm64 refusals, mic/TCC helpers
- `renderer/overlay/capture/{worklet.js,resample,pipeline,mic}.ts`: worklet port, windowed-sinc resampler, 100 ms PCM16 frames, getUserMedia mic
- `build/entitlements.mac.plist`, `package.json` `build.mac`: entitlements + Mic/AudioCapture usage strings (only WP3 edits this block)
- `electron/prescreen-model.ts`: `findPython` exported (one word)
- `scripts/copilot-e2e/*`: dev harness (fake mic device → real pipeline → Moonshine), S1 harness
- `docs/plans/interview-copilot/spikes/S1-macos-system-audio.md`: spike report

**Decisions made:**
- Silent detector lives in main (fed by chunks), not the renderer: main state is authoritative and catches both "no chunks" and "all zeros". Alternatives: renderer-side detector.
- Worklet imported with `?worker&url`: plain `?url` inlines small files as `data:` URIs, which `script-src 'self'` blocks.
- Default Moonshine model `small` (`DEFAULT_MOONSHINE_MODEL`), switchable until S2 names a winner; whisper-mlx / faster-whisper throw "not available yet" in `engines.ts`.
- Chromium fake capture file needs `--disable-features=AudioServiceSandbox` on macOS or the device yields silence.

**Patterns used / confirmed:** prescreen-model install pattern; sidecar framed stdin + JSON-lines stdout; TDD with fake adapter/child.

**Blockers & resolutions:** dead fake-mic (audio sandbox) → found by the new silent detector, fixed with the flag above.

**State:** in_progress (awaiting G-B answer)

**Next steps:**
- Wire `careerloom:copilotAudio` (`ipcMain.on` → `session.audio`) and real `copilotStart/Stop/ListSttModels/InstallStt` in main/handlers (WP0/WP4 files).
- Add whisper-mlx / faster-whisper adapters + `vad.ts`/`buffer.ts` chunker after S2 report; measure model sizes for `SttModelInfo.sizeMb` (moonshine small ≈ 141 MB models + ≈ 100 MB venv).
- S1 follow-ups: denied/TCC-reset-on-update test with a QA app id; confirm `Privacy_AudioCapture` pane id.
