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

**State:** done (PWD fix committed)

**Next steps:**
- User: restart `npm run dev` (main-process changes) and retest; paid Zen model needs credits — untested live.
- Commit + release when asked.
