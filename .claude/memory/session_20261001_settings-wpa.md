---
name: 20261001-settings-wpa
description: Settings rebuild WP-A core backend — contract, atomic migration-safe settings.json, key manager + cheap connection tests, prefs, data/retention, reset, diagnostics, revoke
type: project
---

**Task:** Settings rebuild package A (backend for the rebuilt Settings page); design in docs/plans/settings-rebuild/
**Branch:** livelong99/settings-rebuild
**Date:** 2026-10-01

**Files changed:**
- `electron/settings/{types,prefs,keys,keys-test,data,handlers}.ts`: contract types, additive prefs normalisers, key registry (openrouter/opencode/firecrawl), 8 s no-token tests, data helpers, 14 IPC handlers
- `electron/context.ts`: Settings gains prefs + keyMeta; loader never throws, falls back to .bak; writes atomic (tmp+rename), unknown fields preserved, .bak only from a valid file
- `electron/main.ts`, `preload.ts`, `renderer/lib/types.ts`: handlers registered, bridge typed; legacy setApiKey/getSettings delegate to the new code; checkForUpdates + update opt-out gating
- `electron/updates.ts`: `peek()` (no network) for the opt-out
- `electron/integrations/{browser-login,firecrawl}.ts`: acks list/revoke; Firecrawl key now validated via setKey
- `electron/docs-gen/handlers.ts`: per-document options fall back to prefs.docs

**Decisions made:**
- Theme, language, refresh cadence stay in localStorage (renderer-side): they apply before IPC and avoid a second source of truth. Alternative: move into prefs.
- Reset "everything" keeps folder + runner, clears prefs, keys, model choices.
- Retention is opt-in (default forever); prune runs at launch and on demand.

**Patterns used / confirmed:**
- Sentinel-key property test over every settings handler, integrations list/detail, public settings, settings.json and console output.
- Test results carry fixed messages only, never raw errors.

**State:** done (WP-A)

**Next steps:**
- B/C/D/E renderer packages consume the bridge (keysList/keysSet/keysTest, prefs*, data*, settingsReset, diagnostics, browserAcks/Revoke, checkForUpdates).
- Copilot `copilotReadiness`/`hasKey` is not covered by the sentinel test.
