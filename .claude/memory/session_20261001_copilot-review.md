---
name: 20261001-copilot-review
description: Independent review of the Interview Copilot (copilot-int); 3 HIGH fixed (stop-while-arming race, scoring via agent CLI, localOnly unenforced), MEDIUM/LOW listed in docs/plans/interview-copilot/review.md
type: project
---

**Task:** REV, read-mostly review + hardening of copilot-int. **Branch:** livelong99/copilot-review. **Date:** 2026-10-01

**Files changed:**
- `electron/copilot/session.ts`: generation counter so stop during arming can never reach `listening` (kill-switch race).
- `electron/copilot/privacy-calls.ts` (+test): `blockWhenLocalOnly` provider wrapper, `createScoreCall` (scoring via configured provider, redacted).
- `electron/copilot/live.ts`, `defaults.ts`: wired both; scoring no longer uses `runText` (agent CLI).
- `docs/plans/interview-copilot/review.md`: findings H1-H3 fixed, M1-M10, LOW, checked-OK list.

**Decisions made:**
- Scoring goes through OpenRouter like live answers: transcript must not reach an undisclosed vendor (consent copy says OpenRouter only). Alternative: keep agent CLI for practice only; rejected as more code and a second data path.

**Blockers & resolutions:** worktree had no node_modules → `npm ci --ignore-scripts`.

**State:** done

**Next steps:**
- Decide on M1 (sweep must also clear suggestions/scorecard text), M2 (unregister hotkeys on stop), M3 (uncaughtException listener), M5 (neutralize posting text), M8 (THIRD_PARTY_NOTICES for moonshine-voice + Open-Cluely).
