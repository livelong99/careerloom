---
name: 20261001-settings-b-shell
description: Settings rebuild package B - shell (nav/search/deep links), General/Data/Advanced pages, providers, Integrations screen removed from nav
type: project
---

**Task:** Settings rebuild package B (design.md s.7). **Branch:** livelong99/settings-b-shell

**Files changed:**
- `renderer/components/settings/*`: SettingsShell, SettingsSearch, settings-registry, pages.ts, kit.tsx (SaveState/ReadinessBadge/SettingChip/TestResult/DangerZone/ConfirmDialog/applyWithUndo), useFocusPulse, attention, localPrefs, AppPrefsProvider, PageStub
- `renderer/components/settings/pages/`: General, Data, Advanced real; Runners/Keys/LocalModels/Integrations/Jobs/Resume/Agent/Copilot/Monitoring are stubs exporting `<Name>Page(props: PageProps)`
- `App.tsx`, `Sidebar.tsx`, `CommandPalette.tsx`, `lib/nav.ts`, `lib/toast.ts`, `ToastHost.tsx`, `kit/Group.tsx` (moved from copilot, re-exported)

**Decisions:**
- Deep link = `data-focus="<id>"` on any Group/Row; shell finds it (retries ~1s), opens collapsed Danger zones, pulses 1.2s.
- Only the active page is rendered (`flex` class defeats `hidden` on inactive Radix panels).
- Language/cadence providers live in AppPrefsProvider (localStorage `careerloom.locale`, `careerloom.refreshInterval`); locale change remounts subtree.
- Resets live in Advanced (design/prototype), clear `careerloom.*` localStorage then reload.
- Screenshots via static server + synthetic mock bridge (another Electron was running); not an Electron clone pass.

**State:** done. **Next:** C/D/E replace stub page files; A to add openPath (Show in Finder) and a log-tail IPC if wanted; delete sections/Integrations.tsx (D).
