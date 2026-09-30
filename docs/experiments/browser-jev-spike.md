# Experiment: a local "System One" model as the browser-board driver (rejected, 2026-10)

**Idea.** Drive Chrome with [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) (MIT) against a local
[openjev](https://github.com/razorback16/openjev) (Apache-2.0) server running a small encoder model, instead of a
paid agent deciding every step. Target: ≤ $0.05, ≤ 40 s, ≥ 25 jobs per LinkedIn page, nothing leaving the machine.

**Versions.** openjev 0.5.0 @ `dcd2094`, laya 0.3.6 (`convaiinnovations/laya-typed-decisions`, ModernBERT-large),
Verdict (`heman10x/rlcd-modernbert-151m`, via gliclass 0.1.20), jev-ultrafast 0.1.0 @ `1231850`, browser-harness 0.1.13,
torch 2.14, Python 3.12 (jev-ultrafast needs ≥ 3.12; one venv covered everything). CPU, 4 threads, 16 GB Mac.

**What worked.** openjev's `/v1/systemone` accepts jev-ultrafast's schema under the `jev-latest` alias; the only patch
needed is one line in `model.py` (`post_json(os.environ.get("TYPESAFE_BASE_URL", "https://api.typesafe.ai") + "/v1/systemone", …)`).
browser-harness attaches to a Chrome we launch through `BU_CDP_URL`; it needs `BH_TELEMETRY=0` and `BH_UPDATE_CHECK=0`
(it otherwise posts to PostHog / checks GitHub), `BH_RUNTIME_DIR` for isolation, and its daemon outlives the run.

**Model accuracy (the gate).** 40 labelled synthetic states × 4 operations (scroll / next page / done / blocked;
chance 25 %, always-"done" 40 %), three prompt forms, states of 200–390 tokens (no truncation):

| model | raw form | plain-language situation | categorical fields | latency |
|---|---|---|---|---|
| Laya 421M | 40 % | 60 % | 55 % | ~250 ms |
| Verdict 151M | 17 % | 55 % | 40 % | ~100 ms |

Mean confidence was 0.04–0.18 (near-uniform probabilities). A live 3-page static run with Laya chose "next page" on
the first step, before scrolling. A plain `if/else` on the same facts scores 100 %.

**Decision.** No model. Ship deterministic extraction + scripted scroll/pagination (LinkedIn, Naukri, Indeed,
Glassdoor), a site-agnostic card finder and JSON-LD for other boards, and the existing agent as the fallback
(`electron/browser-driver/`). Live, headless, read-only, real cookies, one page each: LinkedIn 25 jobs / 14.7 s,
Naukri 20 / 10.7 s, Indeed 16 / 10.4 s, 0 tokens (LinkedIn baseline with the agent: 25 jobs, 148 s, $0.47).

**Revisit when** a model fine-tuned for page-control decisions exists (or we can fine-tune one on logged
states) and beats the heuristics on stale-extractor recovery, which is the one thing the heuristics do poorly.
