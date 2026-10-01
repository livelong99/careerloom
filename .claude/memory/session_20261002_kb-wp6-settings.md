---
name: 20261002-kb-wp6-settings
description: KB WP6 — Settings > Interview prep page, Brave key test (one tiny query), consent reset on provider change, config IPC (contract v1.1); branch livelong99/kb-wp6-settings
type: project
---

**Task:** KB-WP6 Settings (plan s.11). **Branch:** livelong99/kb-wp6-settings. **Date:** 2026-10-02

**Files changed:**
- `electron/kb/types.ts`, `preload.ts`, `kb/handlers.ts` (+test): contract v1.1 (tag `kb-contract-v1.1`) adds `interviewConfig()` / `interviewSetConfig(patch)`; lead-approved, additive.
- `electron/kb/defaults.ts` (new, pure) + `config.ts`: defaults moved out so the renderer's Reset can import them; `writeInterviewConfig` clears `consentVersion` when the search backend changes without a new grant.
- `electron/settings/keys-test.ts` (+test): Brave test = one `count=1` query with `X-Subscription-Token`; result stores no key. Exa/Serper tests still "arrive with adapter".
- `renderer/components/settings/pages/InterviewPrep.tsx` (+test): Research / Search and sources (incl. allowed sources) / Interviewer voice / Question bases, Reset with confirm; `settings-registry.ts`: `interview:*` deep links.
- `scripts/kb-settings-qa/run.mjs`, `docs/plans/job-knowledge-base/qa/`: cloned-profile QA, dark+light shots, 10/10 checks.

**Decisions made:**
- Never-fetch group is a disabled, unchecked display box; the config has only six source keys, so it cannot be enabled. Alternatives: a setting with a lock (rejected: a setting can be flipped).
- Out-of-range numbers are flagged invalid, not clamped silently (main still clamps).
- No Import/Export row: `kbExport` is per job, there is no all-jobs API; export stays on the KB tab.
- Premium voice shows a "Coming later" badge, no dead button.

**Patterns used / confirmed:** `useCopilotConfig`-style optimistic save + revert; `Group/Row/Note` kit; `data-setting-id` deep links; RTL tests with a Proxy bridge.

**Blockers & resolutions:** QA profile showed onboarding (needs AGENTS.md + modes/ and no `careerloom.onboarding` localStorage). I mistakenly SIGTERMed the user's own dev app (PID from pgrep) while stopping my QA instance: reported to the lead; never kill by a pgrep'd PID, match `--user-data-dir` of the clone.

**State:** done. **Next steps:** WP3/WP4 pass `goToSettings('interview-prep', 'interview:search' | 'interview:voice' | 'interview:research')` into their chips via props; WP5 adds the Kokoro row focus id in LocalModels; WP2 wires `kbSearchKeyTest` to the same one-query call.
