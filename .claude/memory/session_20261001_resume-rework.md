---
name: 20261001-resume-rework
description: Resume rework — side-nav workspace (6 pages), research-backed ATS engine (parse health + job match, code-owned scores), Apply/Undo with fact check, skill-up + verified courses; branch livelong99/feat-resume-rework
type: project
---

**Task:** Resume page rework, feature 2 (ATS that always said 99 → real scoring; Apply on every finding; skill-up; shadcn registry UI)
**Branch:** livelong99/feat-resume-rework (local commits, not pushed)
**Date:** 2026-10-01

**Files changed (by area):**
- `electron/ats/*`: engine (parse health 100 = text-layer 30/sections 20/contact 15/dates 15/layout 10/length 10; job match 100 = coverage 35/semantic 20/seniority 15/evidence 15/bullets 15), lifecycle (`analyze`, `applyFlow`, `store`, `findings`, `prompt`, `courses`, `factCheck`, `handlers`), pdf.js text layer (`pdfText`), local-model bridge (`embed`), golden-set scaffold
- `electron/resume-profile.ts`, `resume-agent.ts`: profile JSON gained awards/certifications/skillGroups + `rebuildProfile`/`mergeProfileJson` (fixes the PDF dropping ~32% of cv.md)
- `electron/runner.ts`, `opencode.ts`, `context.ts`: `textOnly` option (ATS runs have no file/shell tools; 240k → 24k input tokens, 7 → 1 turn)
- `electron/fit-sidecar.ts`: additive `sim` command; `electron/contract.ts`, `preload.ts`, `renderer/lib/types.ts`: marked ATS / Resume section
- `renderer/sections/Resume.tsx` + `renderer/sections/resume/*`, `renderer/components/resume/*`: shell + Overview/Content/Templates/ATS analysis/Skill-up/Research; 12 shadcn registry components in `renderer/components/ui/`; removed SourceRail/Inspector/AtsGauge/InsightsTab/EditTab and the old scoreAts/rankAgainstJob/buildAtsCheckHtml
- `package.json`: +pdfjs-dist (dependencies; only legacy/build ships, +5.7 MB), +sonner, +react-resizable-panels

**Decisions made:**
- Code owns every number; the agent only extracts requirements/judgements (score keys stripped at any depth). Alternatives: LLM-scored (rejected: unstable, inflates).
- Two scores, never blended; "parse-risk heuristic" label, ranges, confidence; global ceilings 98/97; clean one-column résumé scores ~96 (real), so the job match is the discriminating number.
- Agent replies with JSON (no file tools); `needs_input` resumes the session (claude/agy/opencode/zen) or re-runs statelessly (codex); max 3 rounds / 5 questions, one repair retry.
- factCheck blocks new numbers/skills/names unless `_override`; skill Apply needs a `have:<skill>` yes.
- Courses only from web-search runners (claude, antigravity), every URL HEAD/GET-verified in main; "No verified course found" otherwise.
- Semantic cosine window 0.50–0.76 measured on 14 queries (not a calibration).

**Patterns used / confirmed:** `Deps` injection for the lifecycle (fake agent in tests); clone-profile QA via CDP script; unlayered codeburn th/td beat Tailwind → `.prose-table` opt-in; react-resizable-panels v4 needs "30%" strings; Progress needs explicit height + indicator colour.

**Blockers & resolutions:** rebuild dropped old profile JSON keys → merge; semantic 0/20 live → recalibrated; agent explored files (240k tokens) → text-only tools; my own `sed -i -E` created `*-E` backups in commit 1 → removed (never use `sed -i` without `''` on macOS).

**State:** done (see worker_done for deferred items)

**Next steps:**
- Golden set: add ≥30 human-labelled (cv, JD, label) pairs to `electron/ats/golden/labelled.json`; then fit the cosine window and call the score calibrated.
- Resolve `jobId` to a saved JD in `atsAnalyze` (UI is paste-only today).
- Live-test the codex stateless answer path and a claude/antigravity course-search run (only opencode was run live).
- Windows: pdf.js + template render path untested.
