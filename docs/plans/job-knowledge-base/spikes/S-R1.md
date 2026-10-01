# S-R1: live research dry run

**Status: not run: needs key.** No Brave (or other search) key and no OpenRouter key were available to the build agent, so nothing below was measured. The numbers table is a template for the lead to fill in on a cloned profile. Gate G-R (plan §11 WP2) stays open until it is filled.

The offline run of the same pipeline (synthetic web, scripted model; proves wiring, not yield) is: `npm run build:electron && node scripts/kb-research-dry.mjs`.

## How to run (user, cloned profile only)

1. Pick three real jobs from the **cloned** profile (plan §17 Q6) and write `jobs.json` by hand: `[{ "title", "company", "techStack": [], "skills": [], "seniority", "gaps": [], "requirements": [] }]`. No CV is read or sent; never point this at the real career-ops folder.
2. `npm run build:electron`
3. ```
   CL_LIVE_RESEARCH=1 BRAVE_API_KEY=... OPENROUTER_API_KEY=... \
     node scripts/kb-research-dry.mjs --live --jobs jobs.json --depth standard --max-usd 1 --out /tmp/kb-dry
   ```
   Other search backends: `EXA_API_KEY`, `SERPER_API_KEY`, or `SEARXNG_URL=http://127.0.0.1:8080` (keyless, best effort). Several are tried in the order Brave → Exa → Serper → SearXNG. `--model` picks the extraction model (default `openai/gpt-4.1-nano`). The spend cap `--max-usd` covers all jobs together.
4. Copy the two tables the script prints into the sections below; the generated KBs are in `<out>/<n>.kb.json` (review a few items by eye: wording, sources, evidence).

## Results (to fill in)

| Job | Status | Items | % sourced | Sourced | Generated | Pages | Searches | Skipped | Cost $ | Time s |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | not run: needs key | | | | | | | | | |
| 2 | not run: needs key | | | | | | | | | |
| 3 | not run: needs key | | | | | | | | | |

Targets from the plan: ≥ 50–70 % sourced (labelled), ≤ $0.30 and ≤ 5 min per job (typical ≈ $0.13 / 2–4 min).

### Failures per host
| Host | OK | Failed | Why (robots, 403, empty, timeout, denied) |
|---|---|---|---|
| | | | |

### Observations for the lead (G-R)
- Yield per job and per source kind (stack-exchange, GitHub lists, company pages, blogs):
- Which hosts blocked or returned thin pages (and whether CDP / Firecrawl rescued them):
- Quality spot-check (5 items per job): wording is our own, evidence real, skills sensible, difficulty plausible:
- Cost split: search vs model; did the cap stop any run (`partial`)?
- Terms-of-service observations (Brave storage clause: we keep URLs, titles, ≤ 200-char snippets and our own item text only; no page text):
- Recommended defaults to confirm: depth, model, budget, allowed source groups:
