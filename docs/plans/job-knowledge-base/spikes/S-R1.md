# S-R1: live research dry run

**Status: not run: needs key.** No Brave (or other search) key and no OpenRouter key were available to the build agent, so nothing below was measured. The numbers table is a template for the lead to fill in on a cloned profile. Gate G-R (plan §11 WP2) stays open until it is filled.

The offline run of the same pipeline (synthetic web, scripted model; proves wiring, not yield) is: `npm run build:electron && node scripts/kb-research-dry.mjs`.

## How to run (user, cloned profile only)

You need two keys, both passed as environment variables for this one command (a CLI cannot read the app's keychain, nothing is stored):
`BRAVE_API_KEY` (search; free $5 monthly credit at https://api-dashboard.search.brave.com, about 50 jobs) and `OPENROUTER_API_KEY` (the extraction model, nano-class by default). The flag `CL_LIVE_RESEARCH=1` is the "yes, spend real money" switch: without it the script refuses to go live.

1. Write `jobs.json` by hand with **three** real jobs from the **cloned** profile (plan §17 Q6). No CV is read or sent; never point this at the real career-ops folder. One object per job; the fields are what the app takes from a structured posting:
   ```json
   [
     { "title": "Senior Frontend Engineer", "company": "Acme Corp", "seniority": "Senior",
       "techStack": ["React", "TypeScript", "GraphQL"], "skills": ["System design", "Leadership"],
       "requirements": ["Strong React and TypeScript experience"], "gaps": ["GraphQL"] },
     { "title": "…", "company": "…", "techStack": [], "skills": [], "gaps": [] },
     { "title": "…", "company": "…", "techStack": [], "skills": [], "gaps": [] }
   ]
   ```
2. Build once: `npm run build:electron`
3. Run (cap **$1 total across all three jobs**, standard depth; each job is also capped at the smaller of $0.50 and what is left):
   ```
   CL_LIVE_RESEARCH=1 BRAVE_API_KEY=... OPENROUTER_API_KEY=... \
     node scripts/kb-research-dry.mjs --live --jobs jobs.json --depth standard --max-usd 1 --out /tmp/kb-dry
   ```
   - `--max-usd` is the hard spend cap for the whole run; the script skips remaining jobs once it is reached and a run that hits its cap ends `partial`.
   - `--depth quick|standard|deep` (default standard), `--model <openrouter id>` (default `openai/gpt-4.1-nano`).
   - Other search backends, tried in the order Brave → Exa → Serper → SearXNG: `EXA_API_KEY`, `SERPER_API_KEY`, `SEARXNG_URL=http://127.0.0.1:8080` (keyless, best effort).
4. The script prints two tables (per-job yield and per-host fetch results) and writes each KB to `/tmp/kb-dry/<n>.kb.json`. Paste the tables into the sections below and spot-check five items per job in the JSON (wording, sources, evidence).

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
