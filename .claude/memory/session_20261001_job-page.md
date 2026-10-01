---
name: 20261001-job-page
description: Selected Job page (replaces drawer/sheet) - structured Overview/Job/Match/Skill-up/Documents/Report tabs, tolerant report parser, cheap-model posting structuring, per-job ATS, tailored resume + cover letter with fact gates and the vendored humanizer; branch livelong99/feat-job-page
type: project
---

**Task:** "Selected job page instead of the side drawer", structured not raw, per-job match/skill-up, personalised resume + humanized cover letter
**Branch:** livelong99/feat-job-page (local commits, not pushed)
**Date:** 2026-10-01

**Files changed (by area):**
- `electron/job-view/*`: `reportParse.ts` (pure, tolerant, never throws; letter OR keyword sections, locale headings), `jdStructure.ts` (deterministic pre-pass + ONE small-model call for gaps, cache by sha256(text+schema+prompt version), one repair, falls back), `keywords.ts` (covered/related/missing via ATS skill ladder), `agent.ts` (`runText`, helper vs main tier, `DEFAULT_HELPER`), `handlers.ts` (`jobView`, `setHelperModel`, `jobContext`, `resolveJd`)
- `electron/docs-gen/*`: `gate.ts` (fact gate: sentence-level factCheck + source quotes + `lostFacts` + `aiTells`), `resumeEdits.ts`, `prompts.ts`, `generate.ts` (`tailorResume`, `writeCover`), `artifacts.ts` (`data/careerloom-artifacts.json`, `output/careerloom/<reportNum|hash>-<slug>/`), `coverHtml.ts`, `handlers.ts`
- `electron/humanizer/*`: vendored blader/humanizer v3.1.0 (`SKILL.md`, `LICENSE`, mirrored in `skill.ts`), `CONDENSED_RULES`, `NO_TOOLS`, `humanize()` (embedded mode, `<final>` tags)
- `electron/ats/*`: `jobStoreDir` (per-job store folder `ats/jobs/<sha>/`, resume-level untouched); `atsAnalyze({jobId})` resolves the JD; `atsGet/atsAnswer` take `jobId`; ATS runs now `neutral`
- `electron/context.ts`: `helperModels` setting, `AgentPromptOptions.model` + `.neutral` (text-only claude/opencode run in `userData/text-runs`, no skills); `electron/resume-pdf.ts`: `renderCvText`, `htmlToPdf`, exported `printHtml`; `electron/integrations/github.ts`: root SKILL.md; `electron/main.ts`: 2 lines (register handlers); `jobs.ts`: export `listJobs`
- `renderer/sections/Job.tsx`, `renderer/components/job/*`, `renderer/lib/jobNav.ts`, `resume/SkillUpSections.tsx` (extracted, shared); removed `ReportDrawer`/`JobSheet`; Settings: helper-model picker

**Decisions made:**
- Deterministic first, model only fills gaps, every model call single-shot + text-only + cached; cost shown in the UI footers.
- Per-job ATS = its own store folder, not a keyed file: zero change to the merged lifecycle.
- Fact gate before AND after the humanizer; a rewrite that adds or DROPS a fact is discarded (unhumanized, gated draft kept).
- Cover draft uses tags (`<letter>/<claims>/<learning>`), JSON also accepted: free models drift between both.
- Helper calls run in a neutral folder: structuring 25.7k in/200 s -> 11.6k in/42 s.

**Patterns used / confirmed:** `Deps`/injected `TextCall` for testable generation; clone-profile QA via CDP; prompts must not start with `-` (startAgentPrompt refuses) - the skill file starts with `---`.

**Blockers & resolutions:**
- Free opencode models are ALL reasoning models: cover-letter drafts took 4-9 min and up to 32k output tokens, the last one hit the output cap with an empty reply. Live cover letter with the improved prompt + live humanizer pass were NOT verified (mimo timed out at 5 min on the humanizer; longcat hung). Unit tests cover both. Use a non-reasoning model for Documents.
- bash-tool attempts by small models in text-only runs -> `NO_TOOLS` line in every prompt.

**State:** done (see worker_done for deferred items)

**Next steps:**
- Live-verify a cover letter + humanizer pass with a fast non-reasoning model (Claude Haiku / a flash model) and look at the tells removed.
- Windows: PDF render (`renderCvText`, `htmlToPdf`) and text-runs dir untested.
- Run structuring in the background right after an evaluation finishes (today: on first open / job page load).
