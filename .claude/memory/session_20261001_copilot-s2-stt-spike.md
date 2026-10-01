---
name: 20261001-copilot-s2-stt-spike
description: Interview Copilot S2 STT bake-off on this Mac: Whisper small MLX beats Moonshine on WER at equal latency; Moonshine CoreML unavailable in wheel; report + bench script
type: project
---

**Task:** Spike S2 (plan s.11 WP3 step 2): report + `scripts/copilot-stt-bench.py`, no product code
**Branch:** livelong99/copilot-s2-stt-spike
**Date:** 2026-10-01

**Files changed:**
- `docs/plans/interview-copilot/spikes/S2-stt-bakeoff.md`: results table, licences, decision, pinned install recipe
- `scripts/copilot-stt-bench.py`: fixtures (say + noise), real-time-paced runner per engine, `all` matrix with memory_pressure guard

**Decisions made:**
- Default Whisper small MLX, fallback Moonshine small streaming (update_interval 0.1, CPU): only those pass p50 <= 0.8 s with usable WER (6.9 % vs 9.4 %). Alternatives: Moonshine tiny (fast, 10.7 % WER), turbo (2.0 % WER but ~1.5 s, missed finals).
- Latency is endpoint-silence dominated (~0.55-0.7 s); decode 44-480 ms.

**Blockers & resolutions:**
- Moonshine `ort_providers="CoreML"` -> "not in this build" in pip wheel 0.1.5 -> CPU only.
- First Whisper run invalid (VAD floor, partial decode backlog) -> chunker fixed, rerun.

**State:** done (pending lead gate)

**Next steps:**
- Re-run the script on 3-4 real consented recordings + with a call app running before locking the default.
- In WP3 check whether mlx-whisper can avoid torch (1.1 GB venv); add pinned requirements with hashes; ONNX Runtime MIT notice.
