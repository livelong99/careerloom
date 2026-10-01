---
name: 20261001-settings-e-workflows
description: Settings rebuild package E — Jobs/Resume/Agent/Copilot/Monitoring settings pages + Manage-in-Settings chips; Copilot Engine/Transcription/Privacy tabs moved out
type: project
---

**Task:** SET-E workflow settings pages. **Branch:** livelong99/settings-e-workflows (base b2edbed)

**Files changed:**
- `renderer/components/settings/pages/{Jobs,Resume,Agent,Copilot,Monitoring}.tsx`: five pages (named exports `JobsPage` …); anchors via `data-setting-id`.
- `renderer/components/settings/{SettingChip,usePrefs}`: chip + optimistic prefs hook (B may supersede SettingChip).
- `renderer/lib/nav.ts`: `goToSettings(page, focus)`, NavTarget gains page/focus (shared; B owns the App handler).
- `renderer/components/jobs/{prescreen,PrescreenPolicy}.tsx`: popover is now read-only summary + Retrain + link; policy editor + model panel live on Settings › Jobs.
- `renderer/sections/Copilot.tsx` + `components/copilot/{ConfigStrip,ApiKeyRow}.tsx`: tabs Transcription/Engine/Privacy removed → chip strip; API key row links to Keys page.
- `Agent.tsx`, `resume/Ats.tsx`: runner chip, link copy.

**Decisions:** editors re-hosted by embedding existing Page components (no logic copied); no undo toast (needs B's ToastHost action); limits shown read-only only where verified in code.
**State:** done. **Next:** B wires pages into shell + focus pulse on `[data-setting-id]`; C's Keys page must honour `key:openrouter`.
