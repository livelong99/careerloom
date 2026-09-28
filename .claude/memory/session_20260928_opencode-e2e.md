---
name: 20260928-opencode-e2e
description: OpenCode CLI/Zen end-to-end fixes — FreeTierError root cause (denied tools), skill allowlist (-86% tokens), scripted scrolling (-87% browser tokens), Zen API paid-only
metadata:
  type: project
---

**Task:** Fix OpenCode runner + OpenCode Zen API errors, token/cost optimisation (graft used for code lookups)
**Branch:** main (uncommitted) · **Date:** 2026-09-28

**Files changed:**
- `electron/opencode.ts`: browser config uses `'*': 'ask'` not `deny`; `skillAllowlist` (career-ops + installed skills); Zen API lists paid models only, cheapest first; `isFreeModel` fails free picks early; corrected key text.
- `electron/integrations/browser-args.ts`: init-page script scrolls after each main-frame load; agent loses `browser_mouse_wheel`/`--caps vision`; one wait + one snapshot per page; `--output-dir` = private run dir.
- `electron/integrations/web-board.ts`: absolute result/pages paths in the agent prompt.
- `runner.ts`, Settings/Onboarding copy: removed the false "free models stay free with a key".

**Decisions / facts (measured):**
- Zen FreeTierError = request lacks opencode's standard tools (bash). `deny` drops a tool from the request; `ask` keeps it and headless auto-rejects the call. A key does NOT unlock free models over the Zen API — not worked around (provider rule).
- opencode lists every discoverable skill (~/.agents/skills has 1,505) per request: 155k → 22k input tokens with the allowlist; chat run 10.7k tokens, $0.
- LinkedIn 3 pages via OpenCode free: 49 turns/2.7M tokens → 10 turns/350k, 49 jobs, 172 s.

**Blockers & resolutions:**
- Playwright MCP wrote console logs (signed-in page output) to the repo root → `--output-dir`; `.playwright-mcp/` ignored.

- Evaluate on OpenCode CLI: worker couldn't find `batch/careerloom/<id>.worker.md` — `opencode run` resolves its directory from `process.env.PWD` before `cwd` (opencode `cli/cmd/run.ts`), and spawned children inherited Electron's PWD (the Careerloom checkout). Fix: `startRun` (and mcp-client, zen-tools commands) set `PWD` = spawn cwd; regression test in `zen.test.ts`.

- Then evaluate found its files but the JD file was empty (no Firecrawl) and the worker's WebFetch got nothing from Naukri (script-rendered page; markdown converters drop JSON-LD). Fix: `prefetchJd` falls back to `directJd` — plain fetch (public DNS check each redirect, browser UA), JobPosting JSON-LD → text via `jsonLdPostings`/`postingText` (web-board-core), else page text if > 400 chars. Not live-tested: Naukri may still 403 non-browser requests (Akamai) — next option is its jobapi or the browser-board path.

- Naukri still empty with and without Firecrawl → it bot-blocks non-browser clients. Added a third step: `browserPageText` (browser-fetch.ts) renders the page in the user's Chrome via Playwright MCP + Careerloom's MCP client (headless, empty cookie jar, nav lock, no agent/tokens): navigate → wait 3s → snapshot (refs stripped). Private hosts refused before rendering. Verified live here with Playwright MCP 0.0.82 + Chromium on a JS-rendered page; not on Naukri itself.

- Boards: user asked for India-only, categorised, 20-25 starter boards instead of ~170 (career-ops' portals.example.yml, mostly US/EU). Research (Similarweb India jobs ranking etc.; sandbox couldn't open pages, render/JSON-LD guesses unverified) → 24 boards: Common 9 (Naukri, LinkedIn, Indeed India, foundit, Shine, Glassdoor India, TimesJobs, apna, Internshala), Tech 6 (Naukri IT, Instahyre, hirist.tech, Cutshort, Wellfound India, Freshersworld), Finance 5 (iimjobs, Naukri, foundit, eFinancialCareers India, CAclubindia), Consulting 4 (iimjobs, Naukri, LinkedIn, foundit). ICAI CA Jobs dropped (login). All `enabled: false`; bot-protected → `fetch: browser`, server-rendered → `firecrawl`. New `category` on boards (Category column + filter). "Switch to India starter pack…" removes boards matching career-ops' example (name or URL) + old Indeed/Glassdoor presets, keeps user-added boards, hides unevaluated jobs, adds the pack.

**State:** Chrome JD fallback and India starter pack committed; both need a live check on the Mac

**Next steps:**
- User: restart `npm run dev` (main-process changes) and retest; paid Zen model needs credits — untested live.
- Commit + release when asked.
