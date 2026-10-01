---
name: 20261001-fix-ui-layout
description: Fixed overlapping/crushed layouts in Copilot Appearance + Settings Copilot/Agent pages; audited all 19 pages and controls in the real app on a cloned profile
type: project
---

**Task:** FIX-UI bug-fix from real-app testing. **Branch:** livelong99/fix-ui-layout. **Date:** 2026-10-01

**Files changed:**
- `renderer/sections/copilot/Appearance.tsx`: grid `26rem_minmax(0,1fr)` (preview min-content no longer crushes controls).
- `renderer/components/copilot/OverlayPreview.tsx`: zoom-to-fit wrapper so 780-1200 px overlay stays in its card.
- `renderer/components/kit/Group.tsx`: Row wraps (label min 12rem); Note breaks long text. Shared file, smallest edit.
- `renderer/components/copilot/{TierCards,LlmModelPicker}.tsx`: auto-fit tier grid, wrapping pills/ids, Change+Test stay together.
- `renderer/components/settings/pages/{Copilot,Agent}.tsx`: pt-0 selector scoped to page frames; Agent table uses `.prose-table`.
- `layout.test.tsx`, `scripts/layout-qa/*`, `docs/plans/fixes/layout/` (before/after shots, README).

**Decisions made:**
- Scale preview with CSS zoom, not scroll: keeps the whole overlay visible. Alternative: overflow-x scroll.
- Checked controls via hit-test + real toggles: none dead; Privacy-mode toggle opens the consent notice first (not a no-op).

**Patterns confirmed:** unlayered codeburn CSS (td/th) beats Tailwind utilities; Radix tabs need real pointer events in CDP QA (el.click() does nothing).

**State:** done. **Next steps:** none; Integrations/Advanced ellipsis is intentional.
