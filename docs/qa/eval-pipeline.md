# Evaluation speed + staged pipeline

Branch `feat/debug-log` worktree · 2026-10-07 · setting is **off by default** (Settings → Jobs & boards → Fast evaluation (beta)).

## 1. Profile of the current flow

Source: 20 `evaluate` runs in a copy of `runs.jsonl` (the user's run history, copied read-only into scratch) plus reading `electron/jobs-batch.ts`, `batch/batch-prompt.md` (44 KB / 6.4k words) and the scripts it calls.

| Where the time/tokens go (per job) | Measured |
|---|---|
| Whole job, antigravity runner | 254–289 s, 2.2–3.1M input / 37–61k output tokens (3 done runs) |
| Whole job, opencode runner | median 29 s, 180k input / 1.3k output tokens, 4–29 turns (14 done runs; range 20–281 s, 45k–2.2M in) |
| Jobs run | strictly one after another (`evaluateSelected` chains `launchWorker`) |
| JD prefetch (Firecrawl → JSON-LD → Chrome) | seconds; not separable in history. Naukri/Glassdoor failures cost 20–30 s each and produced no report |
| `reserve-report-num`, `merge-tracker`, `reconcile-pipeline` | three node spawns per job, ~20–30 ms each: negligible |
| Rule pre-screen (existing) | ~0.02 ms/job (see bench) |

So 96–99% of a job is the agent loop: it re-reads a 44 KB prompt plus `cv.md`, profile and modes on every turn and does a WebSearch for compensation, for every job, whether or not the job could ever fit. At 29–262 s/job, 1000 jobs take 8–73 hours. Nothing before the agent decides whether the job is worth it, and nothing is shared between jobs (identical JDs, identical profile, identical instructions).

## 2. Design

`electron/eval-pipeline/**`. Every stage is a pure function over typed inputs (`types.ts`); `run.ts` sequences them with a checkpoint per stage, `live.ts` binds them to the app.

| Stage | File | What it does | Cost |
|---|---|---|---|
| 0 gate + fetch + dedupe + cache | `stage0-fetch.ts` | title/location gates run **before** any fetch; each JD fetched once (8 in flight) and stored per URL; duplicates = same text for the same place (`jdHash(jd, location)`); verdict cache `eval-cache.json` keyed jd+place+profile+CV hash+prompt version | network only |
| 1 deterministic filters | `stage1-filter.ts` | existing pre-screen rules (location → function → seniority via `prescreen-core.screen`), JD years vs yours, deny words, advertised pay ceiling vs floor (same currency only), user-pinned jobs never dropped | 0 tokens |
| 2 local score | `stage2-score.ts` | skill overlap against the résumé through `ats/skills` (70) + title fit (15) + experience fit (15), 0–100; `skipBelow` 35 | 0 tokens, ~0.2 ms/job |
| 3 batched model triage | `stage3-batch.ts` | 6–8 jobs per request, JD excerpt 1200–1800 chars, candidate digest in the (cacheable) system prefix, strict JSON array, short tags (`jab12cd`) instead of URLs, tolerant parser, bad/short batches are halved and retried (3 tries per job), budget cap, cheap (helper-tier) model. Fit ≥ `escalateMin` 4.0 (max 20/run, best first) → `deep` | ~480 tokens/judged job |
| 4 deterministic writer | `stage4-write.ts` | per light verdict: `reports/NNN-slug-date.md` (header, archived JD, Machine Summary YAML, A–G stubs), `batch/tracker-additions/*.tsv`, a `batch-state.tsv` row; report numbers reserved 50 at a time; **one** merge-tracker + reconcile-pipeline per run. `Skip` verdicts become `SKIP` tracker rows | 0 tokens |

- **Resumable:** `s0.json … s3.json` + `s3.jsonl` (per verdict) + `s4.json` in `batch/careerloom/eval-runs/<run>/`. Same selection + profile resumes the unfinished run; finished runs get a fresh folder and are served from the verdict cache. Folders older than 7 days are pruned.
- **Cancellable:** Cancel on the Run aborts between items; stage 3 verdicts already received are kept; nothing is written to `reports/` while cancelled.
- **Metrics/cost:** per stage in/out, ms, tokens, USD, errors (Run log + `PipelineResult.metrics`); cost through the existing `copilot/cost` meter.
- **Escalation:** `deep` jobs go to the unchanged per-job worker (`evaluateSelected`), one Run each. They compete for the deep slots even when their verdict came from the cache.
- **Skips are explained, not hidden:** dropped jobs are written to the pre-screen store as `unlikely` with the reason (they stay evaluable). `pipeline.md` is **not** touched for skips.
- **Hook:** `jobs.ts` `evaluateJobs` uses `evaluateStaged` only when the setting is on, more than one job is selected and none has a report yet (a quick triage must never replace a deep report through merge-tracker's "higher score wins"). Limit rises from 200 to 5000 ids in that mode. Runner `api` falls back to the old path.

## 3. Numbers

`npx vite-node scripts/eval-bench.ts -- --n 1000 --history <runs.jsonl> --runner opencode|antigravity`. After = the real pipeline code, a fake model that reads the real prompts (token counts are real prompt sizes), model/fetch time **modelled** (4 s + out/80 tps per request, 3 in flight; 0.8 s per fetch, 8 in flight). Legacy cost uses the same hypothetical $0.10/$0.40 per M price for comparability (the real runs were subscription/free).

1000 synthetic jobs (35% match, rest sales/senior/abroad/weak/duplicates):

| | Before (opencode) | Before (antigravity) | After, quick triage only | After incl. 20 deep evals (opencode / antigravity) |
|---|---:|---:|---:|---:|
| wall-clock | 8.2 h | 72.7 h | 2.5 min | 12.3 min / 89.8 min |
| jobs/min | 2.0 | 0.23 | 397 | 81 / 11 |
| input tokens/job | 180k | 2.91M | 139 | 3.7k / 58k |
| output tokens/job | 1.3k | 59k | 11 | 37 / 1.2k |
| cost/job (hyp.) | $0.018 | $0.315 | $0.000018 | $0.0004 / $0.0063 |

Funnel (synthetic): 1000 jobs → 482 dropped by the title/location gates before any fetch → 518 fetched, 55 of them same-text duplicates → 463 → 463 after JD rules (the synthetic JDs never trip them) → 314 after local score → 314 judged in 40 requests (7.8 jobs/request, 479 tokens per judged job) → 294 quick reports + 20 deep. Code-only time for the whole 1000: 0.25–0.37 s.

Real queue (user's `pipeline.md` copy, 5300 pending jobs, real titles and locations, fake JD text): the free gates drop **975 (18.4%) before any fetch** (location 775, function 179, seniority 21), leaving 4325 to fetch. That alone saves ≈ 975 × 0.8 s ÷ 8 ≈ 100 s of fetching, and every one of them was a job the old flow would have spent an agent run on if selected.

Writer vs the real scripts (copy of career-ops, 40 jobs): `reserve-report-num --count`, `merge-tracker` (+39 added, 1 merged by its fuzzy dedupe), `reconcile-pipeline` (Pendientes 5300 → 5260), `verify-pipeline` 0 errors.

## 4. Quality guard

`quality.ts` compares pipeline verdicts with a reference on a labelled sample (positive = fit ≥ 3.5): agreement, Cohen's kappa, missed-positive rate, false-alarm rate, positives dropped before the model, fit MAE.

| Sample | n | Agreement | Kappa | Missed | False alarm | Dropped early | Fit MAE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Synthetic oracle, fake model noise ±0.3 | 945 | 97.0% | 0.92 | 8.6% | 3.0% | 0 | 0.14 |
| Synthetic oracle, noise ±0.4 (test) | 847 | 95.9% | 0.89 | 11.2% | 4.2% | 0 | 0.19 |
| **Real** career-ops reports, stages 1–2 only (`scripts/eval-real-sample.ts`) | 6 | 6/6 | – | 0 | 0 | 0 | – |

The synthetic misses are near-threshold "adjacent" jobs (truth 3.4–3.6) and mostly measure the fake model's noise, not the pipeline. The 6 real reports: 5 dropped by the free gates (full evaluator scored 2.2–2.5; reasons: seniority ×2, function, JD asks 10+ years ×2), 1 passed with local score 83 (full score 4.2). Six is too few to call a rate.

**Not done: agreement of the batched *real* model with the full evaluator.** The OpenRouter key is stored encrypted by the app, so a script outside Electron cannot use it, and I did not run the app against a paid model. Before turning this on by default: run it on ~50 jobs the user has already evaluated deeply and feed their reports to `agreement()` (they carry the reference score); expect to tune `skipBelow` and `escalateMin` from that.

## 5. Tests

`electron/eval-pipeline/*.test.ts` — 34 tests: per-stage behaviour, 1000-job quality run, resume after cancel (no job sent to the model twice), cache, idempotent re-run, dry run, chunked report numbers, `live.ts` end to end with the app context mocked (one Run, one merge, escalation of cached jobs); `settings` prefs + the Settings toggle. Typecheck clean; full `npx vitest run`: 239 files, 2192 passed, 4 skipped. `fakes.ts` (synthetic world + fake model) is compiled into `dist` like any non-test module (≈5 KB); move it behind a test-only path if that matters.

## 6. Review rounds (bugs found by testing, all fixed)

1. `advertisedPayMax` read the wrong capture groups (`$90k - $120k` → null).
2. Stage 2 gave 30 free points for title+years, so the default cut-off (30) dropped nothing; reweighted 70/15/15, default 35.
3. Retry gave a job two tries and lost ~25% at harsh failure rates; now 3 tries per job with halving.
4. Deduping by company+title(+place) before fetching merged distinct requisitions (64% of the real queue in the e2e run); now dedupe is by JD text **and** place after the fetch, and title gates run before it.
5. Same JD posted for two places: the unplaceable one could shadow the placeable one; location is now part of the hash.
6. Cached verdicts came back as plain quick reports for jobs that deserve the deep look; deep selection now runs over cached verdicts too.
7. Long URLs as ids in the prompt (cheap models mangle them) → short tags; candidate moved to the system prefix (cacheable).
8. `Skip` verdicts wrote `Evaluated` rows → `SKIP` rows; URL/TSV cells sanitised; quick triage never runs with `force`.
9. A failing merge-tracker/reconcile step threw away the run's bookkeeping (a re-run would have written every report twice); it is now a reported, non-fatal error.
10. Requests are bounded by characters (`maxPromptChars`) so CLI runners stay under command-line limits (Windows 32k).

## 7. Rollout advice

1. Keep it off by default; offer it in the Jobs selection menu once the real-model agreement above is measured.
2. First real run: 30–50 jobs with a cheap helper model; compare quick scores with deep reports for the same jobs; adjust `skipBelow` (35) and `escalateMin` (4.0).
3. Quick reports are marked `**Depth:** quick` and have stub sections C–F; the Job page should offer "Run full evaluation" on them (not built).
4. Windows and a real Electron smoke test are unverified; `live.ts` was tested with a mocked app context only.
5. Cancel stops the pipeline between items; an agent request already in flight finishes on its own.
6. Possible next steps: OpenRouter direct client for stage 3 (exact usage/cost, true prompt caching, no CLI start-up per request); embedding score in stage 2 through the existing sidecar (one model at a time); a "Run full evaluation" action on quick reports.

## 8. Files

New: `electron/eval-pipeline/{types,util,stage0-fetch,stage1-filter,stage2-score,stage3-batch,stage4-write,run,live,fakes,quality,index}.ts` + 4 test files; `scripts/{eval-bench,eval-real-sample,eval-writer-e2e}.ts`; this doc.
Touched: `electron/jobs.ts` (hook + id limit), `electron/jobs-batch.ts` (`mergeTracker` exported), `electron/settings/{types,prefs}.ts` (+ test), `renderer/components/settings/{usePrefs.ts,testKit.tsx,settings-registry.ts,pages/Jobs.tsx,pages/pages-workflows.test.tsx}`.
