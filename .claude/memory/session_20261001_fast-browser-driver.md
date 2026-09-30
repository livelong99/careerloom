---
name: 20261001-fast-browser-driver
description: Fast browser boards — Careerloom drives Chrome over raw CDP with site/generic extractors, agent as fallback; local System One (openjev/jev-ultrafast) spiked and rejected
type: project
---

**Task:** TASK B "System One browser driver" → spike, then deterministic build. **Branch:** livelong99/feat-browser-driver **Date:** 2026-10-01

**Files changed:**
- `electron/browser-driver/{cdp,chrome,navlock,page,sites,generic,driver}.ts`: raw-CDP client (global WebSocket), Chrome/Edge launcher (0700 profile, killed on exit/error, swept at startup via `cl-bd-`), main-frame nav-lock (Fetch interception), read-only Page (no click/type/select primitive), per-site extractors, generic card finder, tiered driver
- `electron/integrations/browser-fetch.ts`: fast path first, agent fallback; wall → existing blocked message. `browser-login.ts`/`registry.ts`: `fast` toggle + Chrome/Edge check in the Browser login card
- `docs/experiments/browser-jev-spike.md`: spike results table and why the model was rejected

**Decisions made:**
- No model: Laya/Verdict 17–60% on a 4-way control decision (chance 25%); if/else is 100%. Alternatives: flagged openjev path (not built, no notices needed).
- Read-only by construction (no click API); pagination by URL (LinkedIn start=25n, Naukri -n, Indeed start=10n, Glassdoor _IPn); max 3 pages, 3–8 s pauses.
- Tiers: site extractor → JSON-LD → generic repeated-card finder → agent (user wanted something less brittle than per-site selectors).

**Patterns used / confirmed:** serialisable in-page functions (`scriptOf`; closures break, caught by a test); injectable deps (socket, launch, sleep) for tests; fixtures = 6 scrubbed public cards per site.

**Live (headless, real cookies, 1 page):** LinkedIn 25 jobs/14.7 s, Naukri 20/10.7 s, Indeed 16/10.4 s, 0 tokens. Baseline agent: 25 jobs/148 s/$0.47.

**State:** done (481 tests, typecheck, build green).

**Next steps:**
- Windows launch/cookies untested (paths unit-tested only); Glassdoor extractor fixture-tested only (no live page run); embedded-JSON tier (beyond JSON-LD) not built.
- Generic tier company/location are heuristic; consider logging stale-extractor events to tune selectors.
