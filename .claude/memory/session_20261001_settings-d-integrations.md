---
name: 20261001-settings-d-integrations
description: Settings rebuild package D — Integrations page (renderer/components/settings/pages/Integrations.tsx), filter tabs, Firecrawl key link, browser acks revoke, career-ops check/update
type: project
---

**Task:** Settings rebuild SET-D (design.md s.7 package D)
**Branch:** livelong99/settings-d-integrations
**Date:** 2026-10-01

**Files changed:**
- `renderer/components/settings/pages/Integrations.tsx`: `IntegrationsPage({focus?})`; services/skills/plugins rows, Job sources tab = link to Boards, header Check/Update career-ops, Add skill/plugin.
- `renderer/components/integrations/CategoryNav.tsx`: left rail -> horizontal filter tabs (+ `onOpenSources`).
- `renderer/components/integrations/BrowserAcks.tsx`: acknowledged sites list + revoke (`browserAcks`/`browserRevoke`, tolerates "not implemented yet").
- `renderer/components/integrations/{IntegrationDetailPanel,ConfigForm}.tsx`: `extra`/`hideConfig` slots, Firecrawl "Test" label, Revert clears typed secrets.
- `renderer/sections/settings/Integrations.test.tsx`: 7 tests with mocked bridge.

**Decisions made:**
- Firecrawl `apiKey` field hidden here, link dispatches `careerloom:navigate {section:'settings',page:'keys',focus:'key:firecrawl'}`: one key editor only. Alternatives: edit in place.
- Plugin env keys stay editable in the plugin row (writes career-ops .env); keys page shows presence only.
- Job sources not listed (24+ boards live in Boards); tab is a link.

**Blockers & resolutions:**
- Old `sections/Integrations.tsx` left in place until B's redirect lands.

**State:** done (pending lead: delete old screen, wire `IntegrationsPage` in Settings shell)

**Next steps:**
- After B lands: delete `renderer/sections/Integrations.tsx`, point `goToIntegrations` callers at `goToSettings('integrations')`.
