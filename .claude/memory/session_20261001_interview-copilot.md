---
name: 20261001-interview-copilot
description: "Interview Copilot planned and built via Orca agents (WP0-4, S2 bake-off, integration, review, Whisper); feature branch feat/resume-job-copilot"
metadata:
  node_type: memory
  type: project
  originSessionId: 1d78b84f-918c-46cc-a946-3bbd09ef74c6
  modified: 2026-09-30T23:53:49.277Z
---

**Task:** Plan and build Interview Copilot (config screen + overlay), porting the user's own Open-Cluely; Orca run `run_4176955dc122`.
**Branch:** `feat/resume-job-copilot` (single feature branch for main; contains integration-resume-browser incl. Job page + WP0-4 + review fixes + Whisper). Nothing pushed.
**Date:** 2026-10-01

**Decisions made:**
- Open-Cluely is the user's own project: code may be ported; stealth features included as opt-in Privacy mode (off by default, notice). Not built: process/app masquerading or anything aimed at defeating proctoring.
- STT local; S2 bake-off on synthetic audio chose Whisper small MLX default (p50 0.76 s, WER 6.9%), Moonshine small fallback; torch install ~1.3 GB.
- LLM via OpenRouter, answer on demand, macOS first (Windows deferred), retention 3 months, every session linked to a Job.

**Blockers & resolutions:**
- WP2 needed an OpenRouter key: not handed over; live latency table (G-C) still unmeasured.
- Review: 3 HIGH + M1-M8 fixed (kill switch race, unredacted scoring transcript, localOnly enforcement).

**State:** in_progress (gates green: 1187 tests; needs real-device QA)

**Next steps:**
- Run the live harness with a user-provided OpenRouter key (`OPENROUTER_API_KEY`, `--max-usd`), pick per-tier models.
- Real-device checks: hotkey-to-answer, macOS mic/TCC prompt, Dock hide, system audio (M2, S1 says GO).
- Legal review of TODO-legal consent/Privacy copy; M9 (hash-pin moonshine) and M10 (entitlements) follow-ups in docs/plans/interview-copilot/review.md.
- Decide: merge into integration branch / push / PR.
