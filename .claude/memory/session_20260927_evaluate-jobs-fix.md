---
name: 20260927-evaluate-jobs-fix
description: Fixed Jobs "Evaluate" (ran /career-ops pipeline over all 185 pending + stalled on questions) → per-job headless batch worker; per-CLI model selection; Continue-in-chat
metadata:
  type: project
---

**Task:** Evaluate jobs evaluated nothing: it queued the selection then ran `/career-ops pipeline`, which sweeps ALL pending URLs, and the headless agent stopped to ask profile questions.
**Branch:** main (uncommitted)
**Date:** 2026-09-27

**Files changed:**
- `electron/jobs-batch.ts` (new): mirrors batch-runner.sh per selected job — reserve-report-num → Firecrawl JD prefetch → worker prompt from batch/batch-prompt.md written to batch/careerloom/<id>.worker.md → claude/codex/agy run → merge-tracker on success / release number on failure → batch-state.tsv row → reconcile-pipeline. Sequential chain; cancel stops it. Profile gate on example name/location/compensation/target_roles and template _profile.md.
- `electron/jobs.ts`: evaluateJobs → evaluateSelected; skips already-evaluated unless force.
- `electron/runner.ts`/`context.ts`/`main.ts`: per-CLI `--model` (settings.models, validated id), listModels (agy live via `agy models`), agy gets --add-dir.
- `electron/chat.ts` continueRun + RunsDrawer "Continue in chat"; useRuns picks up main-started runs.

**Decisions made:**
- Own orchestration instead of batch-runner.sh: runner uses --dangerously-skip-permissions and is bash-only.
- Worker instructions via file, not argv (batch-prompt.md too big for Windows cmd line).

**State:** done — 283 tests, build green; batch evaluation NOT yet run live (costs tokens).

**Next steps:**
- Live-test one job evaluation on ~/Documents/Interview/career-ops (user's real root; runner currently antigravity).
