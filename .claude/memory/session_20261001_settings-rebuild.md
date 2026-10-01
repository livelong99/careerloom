---
name: 20261001-settings-rebuild
description: Settings page rebuilt (12 pages, 5 groups, key manager, integrations, workflow settings) via Orca packages A-E + QA; branch livelong99/settings-qa stacked on feat/resume-job-copilot
metadata:
  type: project
---

**Task:** Rebuild Settings: segregation, interactive UI, all LLM keys + integrations + other screens' operational settings in one place.
**Branch:** `livelong99/settings-qa` (tip 96caa61, 23 commits ahead of `feat/resume-job-copilot`). Nothing pushed.

**Decisions made:**
- One `settings` screen (side-nav, cmdk search, deep links `navigate('settings',{page,focus})`); Integrations screen deleted/redirected; Copilot Engine/Transcription/Privacy editors moved to Settings (chips + links remain).
- Keys: renderer sees only hasKey + last4 + lastTest; tests are no-token (OpenRouter /auth/key, Zen /models, Firecrawl loopback); sentinel-key property test over every IPC.
- Theme/language/refresh cadence stay in renderer localStorage (no second source of truth). Pre-screen gate thresholds deferred.

**State:** done (gates: 1322 tests; real-app QA 73/74 on cloned profile).

**Next steps:**
- Decide: stack/merge into feat/resume-job-copilot -> main, push, PR.
- Not tested: real-provider 200 response, Windows, Boards-editor browser-login link live.
