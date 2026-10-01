---
name: 20261002-kb-int
description: KB-INT merged kb-wp1..wp6 into kb-int and wired the seams (store, research, interviewer pool/stats, voice, skill signal); cloned-profile e2e on fakes + real `say`; tag kb-contract-v2
type: project
---

**Task:** KB-INT (job knowledge base plan s.11 "Sequencing"): merge WP1-6, wire the packages' reported seams, QA end to end.
**Branch:** livelong99/kb-int (WP0 was NOT in kb-int yet: fast-forwarded kb-wp0-contract first)
**Date:** 2026-10-02

**Files changed:**
- merges (order wp0, wp1, wp2, wp6, wp3, wp4, wp5): conflicts only in `kb/handlers.ts`, `handlers.test.ts`, `stubs.test.ts` (deleted: no stubs left), MEMORY.md (union)
- `kb/hash.ts`: single hash impl; `queryKey` = sha1(backend\0normalised), `inputHash` = sha1(stable([jd,gaps,role,company])) to match the WP2 pinned vectors; new `kbJobDir`. research/{dedupe,plan,state,wiring} now import it; store + exports use `kbJobDir` (job ids are URLs)
- `kb/store.ts`: `removeItem`, `findSource`; `kb/runtime.ts` (`getKbStore` = open + `bindKbStore`); `kb/api.ts` + `kb/views.ts` (summary merges research progress/runId, stale = input changed or older than refreshAfterDays, hidden rule, coverage, whyForYou); `kb/handlers.ts` rewritten (no stubs)
- `kb/voice.ts`: `ttsRuntime()`, `interviewSpeaker(plan)` (Speaker.say resolves on playback ended/cancelled, timeout fallback), plan voice/echo override interview.json for the running interview, `onTtsPlayback`
- `copilot/defaults.ts`: speaker, `ended` hook, `recordStats` -> store, mic frames through `gateAudioMsg`; `copilot/handlers.ts`: typed answers are always recorded (were dropped when STT ran)
- contract v2 (additive): `interviewKokoroStatus`, `interviewSkillSignal`, events `interviewerNotice`, `interviewerState.micPaused`, bridge `onTtsAudio`
- renderer: `useTtsPlayer` (overlay arms only while an interviewer session is active), mic-paused badge + notice, Practice consumes the KB seed (`itemIds` pin) and starts from Settings voice defaults, SkillUpTab signal block + reorder, LocalModels "Interviewer voice" (Kokoro) row, KB estimate uses configured options
- QA: `kb/research/e2e-hooks.ts` (`CL_KB_E2E=1`, unpackaged only: fixture search/web/LLM), `scripts/kb-int-e2e/*`, evidence + `qa.md` in `docs/plans/job-knowledge-base/qa/int/`

**Decisions made:**
- One job folder name `sha1(jobId)[0:24]` everywhere (store, research cache, export file); the store no longer rejects URL-ish ids. Alternative: slugging ids (collisions).
- Interview plan's voice/echo win over interview.json while a session runs; Settings values seed the Practice form (they were not applied before).
- Speaker waits for the overlay's playback event, with a length-based timeout so a missing window never stalls the interview.
- Hidden research items are hidden, user items deleted (`kbItemRemove`), so a refresh never resurrects what the user dismissed.

**Patterns used / confirmed:** CDP QA on a cloned profile (`launch.sh` records the PID; never kill by name); fake OpenRouter extended with rubric/checklist replies; real `say` for the voice.

**Blockers & resolutions:** pre-commit hook rejects command lines with `-n`/`-q`-like flags next to `git commit` => run `git commit -m` alone. Radix tabs need mousedown in CDP (`press`). The fixture web has no skill tags for real postings => QA tags items via `kbItemUpdate`.

**State:** done (see qa.md for the table and the "needs user run" list)

**Next steps:**
- User runs: real Brave key + real research (`CL_LIVE_RESEARCH`), real OpenRouter practice (G-P), Kokoro install + voice, speaker echo self-test (S-E1), see qa.md
- Candidate: cross-session `recent` ids for the selector; push-to-interrupt hotkey registration; kbImport file picker; search-key test for exa/serper
