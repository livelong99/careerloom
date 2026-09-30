---
name: 20261001-copilot-wp4
description: Interview Copilot WP4 — 10 config pages, consent gate + server validation, job-linked session store, retention sweep, practice runner, debrief scoring; gate G-D-prep
type: project
---

**Task:** WP4 Config UI, practice, sessions & debrief (plan.md §11, design.md §3)
**Branch:** livelong99/copilot-wp4-config-ui (local commits, not pushed)
**Date:** 2026-10-01

**Files changed:**
- `electron/copilot/{consent,store,practice,debrief,setup,handlers}.ts`: consent validation (pure, shared version constant), session store (sessions/<id>.json 0600, rebuildable index, consent.jsonl, retention sweep), recorder, mock-interviewer runner, text-only scoring + explicit Apply, Setup context summary, real handlers via `createCopilot(deps)`.
- `renderer/sections/copilot/*` (10 pages), `renderer/components/copilot/*`: pages, ConsentGate (+`consentCopy.ts` = all legal wording, TODO-legal), RetentionControl, model pickers, hooks; `wp1.tsx` is an adapter for WP1's OverlayPreview/PrivacyModeNotice.
- `renderer/sections/Copilot.tsx` (shared, small): header actions + goto-page event. `Copilot.test.tsx`: bridge mock.
- `scripts/copilot-shots/` harness + `docs/plans/interview-copilot/wp4-shots/` screenshots.

**Decisions made:**
- Every handler is async and guarded; unwired modules (WP1–3) resolve `{status:'not-implemented'}` and the UI degrades (catalog fallback, disabled buttons).
- Sessions are recorded by `copilotRecorder` (begin on start, persist on each question, end on stop). WP2/WP3 integration must call `copilotRecorder.line/question/suggestion` and `copilotFeed(line, endOfTurn)` for practice answers.
- Scoring starts at stop and lazily on `copilotGetSession` (no score IPC in the frozen contract); UI polls.
- Apply: job-note appends to `copilot/notes/<hash>.md`; résumé bullet is STAGED in `copilot/bullets.json` (fact-checked), never written to cv.md.
- Practice start accepts additive optional `questionIds`/`custom` (PracticeExtras); contract type not changed.
- Server overrides privacyMode/indicator/provider/retention in the stored consent record.

**Patterns used / confirmed:** TDD (88 electron + renderer tests), `vi.mock('@/lib/ipc')` for component tests, native range/select where Radix fails in jsdom.

**Blockers & resolutions:** Open-Cluely `app-state.js` is a plaintext settings file with no sessions → nothing ported; headers say so.

**State:** in_progress (awaiting G-D-prep review)

**Next steps:**
- Integration: replace `wp1.tsx` bodies with WP1 components; wire `CopilotDeps` (session, answer, context, overlay, checkHotkey, sttModels, benchmark, complete) and recorder/feed calls.
- Legal review of `consentCopy.ts` and the Privacy mode notice; bump `CONSENT_TEXT_VERSION` after edits.
- Decide contract additions: optional `StartRequest.questionIds/custom`; a score-now call.
