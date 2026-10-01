---
name: 20261001-fix-models
description: Copilot OpenRouter models vs data policy - free models flagged, friendly error mapping with actions, paid defaults, opt-in allow toggle
type: project
---

**Task:** FIX-MODELS (Copilot answer-engine model defaults vs `data_collection: deny`)
**Branch:** livelong99/fix-model-policy
**Date:** 2026-10-01

**Files changed:**
- `electron/copilot/providers/errors.ts` (+test): `friendlyLlmError` maps policy/no_key/auth/credits/rate_limit/model_unavailable to message + actions
- `electron/copilot/providers/openrouter.ts`: 404 -> `policy` (data-policy text) or `model_unavailable`; `toModelInfo` marks free models `may-collect`
- `electron/copilot/models.ts`, `live.ts`: probe cache (`copilot-llm-probes.json`) overlays dataPolicy; Test returns code/actions
- `electron/copilot/engine.ts`, `live-wiring.ts`: suggestion on policy errors (never auto-switch); friendly copilotError with actions
- `electron/copilot/config.ts`, `types.ts`, `consent.ts`, `renderer/components/copilot/consentCopy.ts`, `ConsentGate.tsx`: allow default + migration + consent wording
- `electron/copilot/recommended-models.json`: dropped expiring gemini-2.5-flash-lite
- `renderer/components/copilot/LlmModelPicker.tsx`, `sections/copilot/Engine.tsx`: badge text, warning + allow toggle, action buttons
- `docs/plans/fixes/fix-models/`, `scripts/fix-models-qa/`: evidence + harness

**Decisions made:**
- Default flipped to `allow` (user-approved via coordinator); one-time migration via `engine.openrouter.policyMigrated`; consent copy + CONSENT_TEXT_VERSION draft2 state provider retention/training truthfully.
- List API has no data-policy field: free = may-collect, paid = unknown until a deny-policy Test probe. Alternatives: scraping model pages (rejected, not an API).

**State:** `done`

**Next steps:**
- Live check with a real key: paid defaults under deny; reasoning `enabled:false` on mandatory-reasoning models (balanced/deep).
- Overlay should render `copilotError.actions`/`suggestion` (FIX-UI owns layout).
