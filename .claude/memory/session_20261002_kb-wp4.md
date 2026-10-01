---
name: 20261002-kb-wp4
description: KB-WP4 AI interviewer engine + Practice (text first): selector/persona/probe/score/runner, live-path parity seam, Practice form, overlay row/caption/controls, debrief heat map; branch livelong99/kb-wp4-interviewer
type: project
---

**Task:** KB-WP4 (job knowledge base plan s.11): interviewer engine + Practice, typed or STT answers, no TTS yet (the speak hook is a no-op `Speaker` that WP5 fills).
**Branch:** livelong99/kb-wp4-interviewer (base livelong99/kb-wp0-contract, tag kb-contract-v1)
**Date:** 2026-10-02

**Files changed:**
- `electron/interviewer/{select,persona,probe,score,runner}.ts`: the engine; `plan.ts` (parsePlan, planHash, previewPlan), `session.ts` (record, stats write-back, skill-signal.json), `pool.ts` (seam to the WP1 store), `handlers.ts` (`interviewPlanPreview`), `fixtures/{golden-kb,scripted-llm}.ts`, tests
- `electron/copilot/live-wiring.ts`: `interviewerAsked(q)` puts an AI question on the live path (record, show, auto-answer), so cues and suggestions match live
- `electron/copilot/handlers.ts`: `copilotStart` accepts `interview`, builds the runner, saves `SessionDetail.interview`; overlay commands `interviewer: replay|skip|hint` and `typed`
- `electron/copilot/{defaults,debrief,types}.ts`: wiring deps, rubric scores in the debrief prompt, additive OverlayCommand fields
- `electron/kb/handlers.ts` (+test): `interviewPlanPreview` is now real (imported from interviewer/handlers)
- `renderer/sections/copilot/{Practice,Sessions}.tsx`, `renderer/components/copilot/{ModePicker,FocusSkills,VoicePicker,SessionSummary,InterviewLive,InterviewDebrief,heatmap,interviewForm}`, `renderer/overlay/{InterviewerRow,Caption,InterviewControls,useInterviewer,interview.css}` + OverlayView/Overlay mount

**Decisions made:**
- The selector uses a deficit quota for the 3:4:1 mix and a x3 focus-skill boost: soft multipliers let gap skills swamp the mix. Alternative: pure weights.
- Scoring is awaited before the next question (deterministic ramp). Background scoring is the upgrade if latency matters.
- AI questions go through `wiring.interviewerAsked` (auto:true plus the heuristic hint) so route, tier and suggestions equal a heard question. The report-question path is untouched.
- Typed answers live in the app (`InterviewLive`): the overlay is `focusable:false` and cannot take keys.
- The pool comes through `interviewer/pool.ts` (`setInterviewPool`); default null means practice falls back to report questions. Nothing imports WP1.

**Patterns used / confirmed:** scripted LLM + golden KB; injected sink, speaker and LLM; renderer harness `scripts/kb-wp4-shots` (vite :5198 + shoot.sh) for dark/light shots in `docs/plans/job-knowledge-base/qa/wp4-*.png`.

**Blockers & resolutions:** the commit hook rejected some command lines (it seems to read `-n`/`-q` style flags anywhere in the command as no-verify) => keep `git commit -m "..."` in its own simple command.

**State:** done (engine and UI; live voice and the real KB source wait on other packages)

**Next steps:**
- Integration: call `setInterviewPool(jobId => ({ items, skills, recent }))` from the WP1 store at startup; add `updateStats(jobId, itemId, stats)` and pass it as `interviewer.recordStats` in `copilot/defaults.ts`.
- WP5: pass `interviewer.speaker(plan)` (`Speaker.say` resolves when the audio ends) and add the mic-paused badge.
- SkillUpTab read of `copilot/skill-signal/<hash>.json` needs an IPC (contract frozen): deferred.
- G-P: a text-interviewer run with a real OpenRouter key (cap $0.50), run by the lead.
