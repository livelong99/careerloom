---
name: 20261001-copilot-review
description: Independent review of the Interview Copilot (copilot-int); 3 HIGH + M1-M8 fixed with tests, M9/M10 documented as follow-ups in docs/plans/interview-copilot/review.md
type: project
---

**Task:** REV, read-mostly review + hardening of copilot-int. **Branch:** livelong99/copilot-review. **Date:** 2026-10-01

**Files changed:**
- `electron/copilot/session.ts`: generation counter so stop during arming can never reach `listening` (kill-switch race).
- `electron/copilot/privacy-calls.ts` (+test): `blockWhenLocalOnly` provider wrapper, `createScoreCall` (scoring via configured provider, redacted).
- `electron/copilot/live.ts`, `defaults.ts`: wired both; scoring no longer uses `runText` (agent CLI).
- `store.ts` (sweep clears answers/notes, stray-file safe), `overlay-host.ts` (hotkeys freed on stop), `panic.ts` (uncaughtExceptionMonitor), `context.ts` (neutralize posting text), `handlers.ts` (assertSupported live, consent after dup check), `privacy-calls.ts` (redactIfOn, nameFromCv), `THIRD_PARTY_NOTICES.md` (moonshine, Whisper alternates, Open-Cluely).
- `docs/plans/interview-copilot/review.md`: findings H1-H3 fixed, M1-M10, LOW, checked-OK list.

**Decisions made:**
- Scoring goes through OpenRouter like live answers: transcript must not reach an undisclosed vendor (consent copy says OpenRouter only). Alternative: keep agent CLI for practice only; rejected as more code and a second data path.

**Blockers & resolutions:** worktree had no node_modules → `npm ci --ignore-scripts`.

**State:** done

**Next steps:**
- M9 (hash-pin moonshine-voice, offline model check; stt/** is WP3b's) and M10 (narrow entitlements at signing): recipes in review.md.
