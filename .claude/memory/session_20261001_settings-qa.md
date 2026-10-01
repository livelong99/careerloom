---
name: 20261001-settings-qa
description: Settings rebuild integration + real-app QA on a cloned profile: chip/attribute dedupe, search ranking + registry-id fixes, 74-check pass table, secret grep clean
type: project
---

**Task:** SET-QA, integrate/polish/verify rebuilt Settings in the real Electron app (clone only)
**Branch:** livelong99/settings-qa
**Date:** 2026-10-01

**Files changed:**
- `renderer/components/settings/{kit,settings-registry}.ts(x)`, `pages/*`: one `SettingChip`, one deep-link attribute `data-setting-id`, undo on doc defaults / Monitoring retention / runner switch, registry ids now match real controls, label-first search ranking
- `renderer/sections/copilot/Transcription.tsx`: STT install is a chip into Settings > Local models (one installer)
- `renderer/components/integrations/{IntegrationTable,CategoryNav}.tsx`: `data-setting-id` on rows/tabs
- `scripts/settings-qa/*.mjs`: CDP QA drivers (clone only); `docs/plans/settings-rebuild/{qa.md,evidence/QA/}`

- `electron/settings/memory.ts` (+test), `handlers.ts`, `types.ts`: Local models/Advanced memory = vm_stat free+inactive+speculative (was os.freemem, read 0.1 GB on macOS)

**Decisions made:**
- `data-setting-id` over `data-focus`: Jobs/Copilot wrappers already used it. Alternatives considered: keep both.
- Search is label-first, registry order otherwise; no fuzzy scoring (YAGNI).

**Patterns used / confirmed:** clone profile without `opencode.key`/`Cookies*`, `rsync` not `cp -c`; run main-checkout Electron binary against the worktree build; scripts must `process.exit` (CDP socket keeps node alive).

**Blockers & resolutions:** commit hook false-positive on compound commands -> commit alone.

**State:** done

**Next steps:**
- Live-check Boards editor "Browser login settings" link; Windows pass
