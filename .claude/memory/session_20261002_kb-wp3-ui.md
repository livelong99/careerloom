---
name: 20261002-kb-wp3-ui
description: KB-WP3 — Job › Knowledge base tab UI against the frozen kb contract with a dev-only fake backend (?fakeKb=state); all 7 states, dark+light, a11y + RTL tests
type: project
---

**Task:** KB-WP3 (plan §11): KB UI on `livelong99/kb-wp3-ui` (base kb-wp0-contract, tag kb-contract-v1)
**Branch:** livelong99/kb-wp3-ui · **Date:** 2026-10-01

**Files changed:**
- `renderer/components/job/KnowledgeTab.tsx`: stub → composition (status, coverage, filters, bank, sheet, run, dialogs)
- `renderer/components/kb/*`: api (kb() accessor, `?fakeKb`), useKb, filter(+test), BankTable/Filters, CoverageRail, ItemSheet, ItemDialog, ResearchRun, Banners, StatusStrip, EmptyStates, practice (seed hand-off to Practice)
- `renderer/lib/kbFake.ts`: dev-only fake backend, states ready|running|empty|nokey|partial|offline|stale (dropped from prod bundle: `kb()` inlines the DEV check)
- `renderer/kbHarness.{html,tsx}`: dev-only static harness for headless screenshots (not a build input)
- `renderer/components/job/KnowledgeTab.test.tsx`: 13 RTL tests (every state, keyboard, filters, add, a11y names)

**Decisions made:**
- Client-side filter/sort over `kbList(jobId, {hidden:true})` (hidden = include hidden; assumed meaning): ≤400 items, instant, no extra IPC.
- Offline = `navigator.onLine` false (contract has no offline status); `failed` status → red banner + Try again.
- Progress arrives only via `kbProgress`; tab opened mid-run shows "Starting" until the next event.
- Import has no UI (kbImport needs a file path, no picker in contract); Export button + reveal toast.
- Native `<select>`/inputs for filters (robust a11y, no radix in tests).
- Legacy `th/td` rules beat Tailwind: use `!` important utilities on table cells.

**Patterns used / confirmed:** `?fakeKb` flag + inlined DEV guard; `.thread` provenance via `before:` pseudo-element; harness at port 5199 (5173 is the user's dev app).

**State:** done (pending lead gate)

**Next steps:**
- WP1/WP2: emit `kbProgress` on an interval or add progress to `kbSummary`; confirm `hidden:true` semantics
- WP4: consume `takeKbPracticeSeed()` from `renderer/components/kb/practice.ts` in Practice
- Consent dialog for first web research needs a contract method (not in kb-contract-v1)
- Evidence: `docs/plans/job-knowledge-base/qa/wp3/*.png`
