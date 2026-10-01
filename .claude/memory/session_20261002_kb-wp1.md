---
name: 20261002-kb-wp1
description: KB-WP1 store/index/retrieval — per-job JSON store, BM25, retrieve/kbPrefix/selectionPool, import/export, golden fixtures, relevance + latency harness
type: project
---

**Task:** KB-WP1 (plan s.11): job knowledge base store, index, retrieval
**Branch:** livelong99/kb-wp1-store
**Date:** 2026-10-02

**Files changed:**
- `electron/kb/store.ts`: per-job folder (manifest/items/sources/skills/notes), atomic write + `.bak` restore, merge-by-id keeps `user.*`/`stats.*`, 400-item cap, 8 MB budget, in-memory cache + `revision()`.
- `electron/kb/schema-guard.ts`: `parseItem/Items/Sources/Skills/Notes/Manifest`, `LIMITS`; clamps everything read from disk/import.
- `electron/kb/bm25.ts`: tokenizer (c++, c#, .net, node.js, light stemming) + BM25 k1 1.2 b .75 with field boosts.
- `electron/kb/retrieve.ts`: `bindKbStore`, `retrieve`, `kbPrefix` (≤700 tokens, byte-stable), `selectionPool`.
- `electron/kb/hash.ts`, `import-export.ts`, `fixtures/{golden.ts,golden-40.json,labelled.json}`, `scripts/kb-latency.mjs`, tests.
- `electron/kb/stubs.test.ts`: dropped the retrieve WP1 row.

**Decisions made:**
- retrieve/kbPrefix find data through `bindKbStore(store)` (main must call it once): signatures stay as in the frozen stubs. Alternative: pass the store per call (changes the contract).
- Export omits sources, cv hooks, notes, stats; import marks rows `provenance:'user'`.
- Edited items keep their id (stats hang off it); other ids are recomputed from text on read.
- Over-cap commits drop lowest (pinned/edited/user first kept, then confidence).

**Blockers & resolutions:**
- Test hang → LCG low bits cycled, distractor generator never reached 400; use high bits.

**State:** done (handlers still stubs: WP0's handlers.ts needs to call the store — integration)

**Next steps:**
- Integration: call `bindKbStore(openKbStore(() => join(userData,'kb')))` in main; wire kbSummary/kbList/kbItem/kbItemUpdate/Add/Remove/Export/Import in `kb/handlers.ts`; emit `kbChanged`.
- Harder relevance set (low word overlap) if G-R wants one; both metrics are 1.0 on the current set.
