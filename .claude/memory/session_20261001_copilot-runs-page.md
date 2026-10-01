---
name: 20261001-runs-page
description: Runs side drawer replaced by a full Runs page (⌘7): filters, live runs, windowed redacted log viewer, delete/clear, deleteRuns IPC; cloned-profile QA 33/33
type: project
---

**Task:** TASK RUNS: replace RunsDrawer with a "Runs" page. **Branch:** livelong99/runs-page. **Date:** 2026-10-01

**Files changed:**
- `renderer/sections/Runs.tsx` + `renderer/components/runs/{RunList,RunDetail,LogViewer}.tsx`: master/detail page, totals strip, clear/delete dialogs, retention chip.
- `renderer/lib/runsView.ts`: pure filter/totals/selection/steps/links logic (tests first).
- `renderer/lib/nav.ts`: `openRuns(id?)` = `navigate('runs', {id})`, `OPEN_THREAD_KEY`, `continueInChat` (moved from the drawer).
- `renderer/components/RunLog.tsx`: the compact log kept for onboarding; `RunsDrawer.tsx` deleted, all `openRuns` callers re-pointed.
- `electron/log-redact.ts` (+test): shared `redactLog`; `getRunLog` now returns redacted text. `electron/runs-prune.ts` + `context.ts deleteRunRecords` + `deleteRuns` IPC (contract/preload/main).
- `App.tsx`, `Sidebar.tsx`, `useRuns.ts` (`loaded`, `forget`), `testKit.tsx`: section `runs`, key 7, deep link.

**Decisions made:**
- Live log = re-read `getRunLog` on chunk events (throttled 500 ms), not a timer: a hidden window pauses usePolled. Alternatives: push-only chunks (races the backfill).
- Windowed viewer with fixed 18 px rows, no new dependency.
- Only scan/web-board logs survive a restart (existing behaviour); UI says so.
- Redact in main AND renderer: live chunks are raw until read back.

- Job awareness (lead's follow-up): additive `jobId` on RunRecord/Run, stamped by evaluate batch, job-view structuring, docs-gen (résumé/cover), ATS; `indexJobs` resolves run→job by jobId, then posting URL, then report number (report modes), then legacy "Evaluate Company — Title" label. Job filter, Group by None/Job/Status, JobCard (read-only) with Open job / Open match (`openJob(id, 'match')` via sessionStorage tab key). Copilot runs untouched (electron/copilot/** off-limits), so they only resolve by url/report.

**State:** done. **Next steps:** none required; M: Re-run only for agent runners whose mode is in `modes()`.
