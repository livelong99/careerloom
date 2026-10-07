# QA round 2 — cross-review of the merged build

Branch `livelong99/review-rest` (copy of `integration/qa-round1`) · 2026-10-07 · scope: `git diff bdd872d..HEAD` outside Copilot (eval pipeline, jobs/jobs-batch, prefs, Jobs filters, Windows launch, KB abort, TTS).

## Issues found and fixed

| # | Where | Problem | Fix | Test |
|---|---|---|---|---|
| 1 | `eval-pipeline/live.ts` `evaluateStaged` | A second Evaluate on the same selection while a staged run was going resumed the same run folder concurrently: two writers, duplicate reports and tracker rows. The new busy-job filter can't see it (staged Run has `jobId: null`). | module-level `inFlight` guard, clear error | `live.test.ts` "refuses a second staged run" |
| 2 | `eval-pipeline/run.ts` + `stage4-write.ts` | Stage 4 recorded its progress only after the whole stage. A crash/quit after N reports were written re-ran the stage with fresh report numbers → every report written twice. | `onWritten` per job → appended to `s4.jsonl` (legacy `s4.json` still read); resume skips them | `run.test.ts` "checkpoints each written job…" |
| 3 | same | A resumed run with nothing left to write never ran merge-tracker, stranding tracker additions of the crashed run (and a failed merge was never retried). | `WriteDeps.resumed` → finalize still runs | `run.test.ts` "a resumed run that has nothing left…" |
| 4 | `jobs-batch.ts` `evaluateSelected`, `jobs.ts` | Busy filter only saw the *running* job of a chain. Click Evaluate on 10 jobs, click again: jobs 2–10 got a second parallel chain (2× agents on a 16 GB Mac), then chain 1 re-evaluated them (duplicate reports). | `runChain` + `queuedJobIds()`: every job in a chain is claimed until it ends / the chain is cancelled or fails to launch; `evaluateJobs` filters on it | `jobs-batch.test.ts` `runChain` ×2 |
| 5 | `integrations/browser-fetch.ts` `browserPageText` | Staged evaluation fetches JDs 8 in flight; every blocked site (Naukri, 403) falls back to a headless Chrome + `npx` → up to 8 Chromes on a 5k queue. | renders are serialized (one at a time) | `browser-fetch.test.ts` (peak 1) |
| 6 | `jobs-data.ts`, `Badges.tsx`, `JobsTable.tsx`, `contract.ts` | Quick-triage reports (tracker status "Evaluated", score) looked identical to full evaluations in the Jobs table. | `JobListing.quick` from the tracker note; Fit shows `~4.1` with a tooltip "Quick triage score, not a full evaluation — use Re-evaluate" | `jobs.test.ts` "flags a tracker row written by the quick triage" |
| 7 | `settings/usePrefs.ts` | If two quick edits were both refused, the UI kept the older refused value (baked into `before`). | on the newest failure, re-read prefs from main | `usePrefs.test.tsx` second case |
| 8 | `renderer/index.html`, `overlay.html` | **Console error on every start** (found by the smoke): CSP `font-src 'self'` blocked a vite-inlined `data:` woff2. | `font-src 'self' data:` | smoke: 0 console errors (was 2) |

Red→green was run for 1–5 and 7's sibling cases; #6 and #7 tests were added together with the fix (no separate red run).

## Checked, no change needed

- **Eval pipeline off by default:** `defaultPrefs` and `normalizePrefs` give `evalPipeline.enabled=false`; only a literal `true` enables it; the patch validator rejects non-booleans; `evaluateJobs` takes the staged path only with the setting on, >1 job and no job with a report (so force/re-evaluate and quick-over-deep never happen); runner `api` falls back to the legacy path.
- **Cancel:** aborts between items, nothing is written while cancelled, no escalation after cancel; verdicts received are kept (`s3.jsonl`).
- **IPC validation:** `ids()` bounds (200, or 5000 staged) and 2048 chars each; `prefsSet` strict validator; `scanPortals` refuses a second concurrent scan.
- **Memory at 5k:** JDs go to disk (`jd/<sha>.txt`), batches bounded by `maxPromptChars`, 2 LLM in flight, cache JSON ≈ 3 MB. Fine.
- **latest-save-wins (`usePrefs`)**: in-order IPC makes the sequence guard correct; portals.yml now written temp+rename; TTS voice/engine ownership correct (`system|kokoro|openrouter` ids match config); PowerShell quote escaping; `cmd /c npx` for Windows MCP (no shell metacharacters reach it: paths only); KB abort checks; update-check backoff.

## Merged-build smoke (cloned profile, built `dist/`, electron lock held then released)

`scripts/qa-round2/smoke.mjs` over CDP on a clone of `~/Library/Application Support/careerloom` + a copy of career-ops (settings root repointed, Singleton* removed, debug dir reset in the clone):

- All 9 sidebar pages (Overview, Jobs, Boards, Resume, Agent, Monitoring, Runs, Copilot, Settings) render with the right title: PASS; Settings › General / Jobs & boards / Advanced: PASS.
- Console/exception/log errors after reload: **0** (the two CSP font errors above fixed).
- Debug log: a missing folder is refused ("Choose an existing folder for the debug log"); a temp folder is accepted, `careerloom-debug-<date>.log` is created with `log started`, `environment`, `careerloom:settings` events and `prefsSet` IPC lines (8 lines), key-free; the Advanced page then shows the folder with Open folder / Change…; `log stopped` is written when turned off.
- The native folder picker can't be driven headlessly, so the page's `prefsSet({debug:{dir}})` (what "Turn on…" sends) was called directly.
- Not run: real model/OpenRouter calls, evaluate against the real queue, Windows.

## Unresolved / follow-ups

1. merge-tracker's "higher score wins": a later **full** evaluation scoring *below* a quick triage of the same job may not replace the quick row. Needs a look at career-ops' `merge-tracker.mjs` (not in this repo).
2. A staged run does not claim its jobs for the single-job path: clicking Evaluate on one of those jobs during a staged run can still duplicate that one report (staged-vs-staged is now blocked).
3. Stage 4 `batch-state.tsv` rows are written once at the end; a crash loses them (the reports/tracker additions are safe).
4. Real-model agreement of the batched triage with the full evaluator is still unmeasured (see `eval-pipeline.md`), so keep it off by default.
5. Windows paths (cmd /c npx, SAPI quotes, PYTHONUTF8) are unit-tested only.

Files: `electron/{contract,jobs,jobs-batch,jobs-data}.ts`, `electron/eval-pipeline/{live,run,stage4-write}.ts`, `electron/integrations/browser-fetch.ts`, `renderer/components/{Badges,jobs/JobsTable,settings/usePrefs}.ts(x)`, `renderer/{index,overlay}.html`, tests (`live`, `run`, `jobs`, `jobs-batch`, `browser-fetch`, `usePrefs`), `scripts/qa-round2/smoke.mjs`.
Final: `npm run typecheck` clean; `npx vitest run` 252 files, 2309 passed, 4 skipped; `npm run build` OK.
