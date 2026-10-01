# Settings rebuild — audit

Base: `livelong99/settings-rebuild` (= `feat/resume-job-copilot`). Read from code on 2026-10-01; nothing run. Verdict column: **MOVE** = single editor in Settings, the original screen shows a read-only chip + "Manage in Settings"; **STAY** = contextual, stays where it is (reason given).

## 1. What exists today

`renderer/sections/Settings.tsx` (195 lines) is a flat stack of Panels: Workspace, Agent (6 runners + model/helper pickers + readiness), API keys (OpenRouter, Zen), Local model, Appearance (theme). Integrations is a separate screen (⌘7). Copilot has its own 10-page workspace. Pre-screen policy lives in a popover on Jobs. Four documented-but-unwired controls exist (see §5).

## 2. Inventory — persisted settings and secrets

| Setting | Current location (store → editor → readers) | Proposed Settings page | Verdict |
|---|---|---|---|
| career-ops folder `root` | settings.json → Settings/Onboarding (`setRoot`, `setupCareerOps`) → everything | General | MOVE (already there; Onboarding reuses same component) |
| Active `runner` | settings.json → Settings, Onboarding AgentStep (`setRunner`); auto-switch in `refreshReadiness` | AI & Runners | MOVE; Agent screen keeps read-only runner chip |
| `models[runner]` | settings.json → Settings ModelPicker | AI & Runners → Models | MOVE |
| `helperModels[runner]` | settings.json → Settings ModelPicker (helper); only `job-view/agent.ts` reads it | AI & Runners → Models | MOVE; show "used by: job structuring" (see §5 gap) |
| OpenRouter key `openrouter.key` | safeStorage → Settings, Onboarding `parts.tsx`, Copilot `ApiKeyRow` (3 editors) | API keys | MOVE; Onboarding + Copilot show status chip + link (or embed the one `KeyField` component) |
| OpenCode Zen key `opencode.key` | safeStorage → Settings | API keys | MOVE |
| Firecrawl key `firecrawl.key` | safeStorage → Integrations ConfigForm (`setIntegrationConfig`) | API keys (+ Integrations page links) | MOVE (editor in API keys; Integrations row shows status) |
| Plugin env keys (`requiredEnv`) | career-ops `config/.env` plain text (0600) → Integrations ConfigForm | API keys (read-only presence list) + Integrations | STAY in `.env` (owned by career-ops plugin contract); editor stays in Integrations page. Shown, never read back |
| Theme | localStorage `careerloom.theme` → Settings | General | MOVE (already) |
| Language | `i18n` LocaleContext — **no Provider, no UI** | General | NEW wire-up |
| Refresh cadence | localStorage `careerloom.refreshInterval`, helpers in `refreshCadence.tsx` — **no Provider, no UI**; every `usePolled` falls to 60 s default | General | NEW wire-up; replaces per-screen `POLL_MS` floors |
| Update check | `updates.ts` 24 h interval, hardcoded, no opt-out; dismissal in `careerloom.updateDismissed` | General | NEW `updates.enabled` + "Check now" |
| Local model (pre-screen) | `~/.careerloom/model`; `localModelStatus`/`installLocalModel` → Settings, Onboarding ModelStep, Jobs prescreen popover (3 embeds of `LocalModelSetup`) | Local models | MOVE; others link |
| Pre-screen policy `{countries, remoteAnywhere, years}` | `data/careerloom-prescreen.json` → Jobs popover `PrescreenSettings` (`savePrescreenPolicy`) | Jobs & Boards | MOVE; Jobs popover keeps a read-only summary chip + "Edit in Settings". Retrain/feedback actions STAY (they act on current results) |
| Pre-screen gates (`GATE 0.8/0.2`, `WEIGHT`, `MIN_PER_CLASS`) | hardcoded `prescreen-core.ts:129` | Jobs & Boards → Advanced | DEFER — decision at G1 (changing invalidates `POLICY_VERSION`) |
| Browser login (`source, profile, cookiesFile, testDomain, pageWait, fast, headless`) | `integrations.json` → Integrations ConfigForm | Integrations | MOVE with the Integrations screen |
| Browser consent `acks[]` | `integrations.json`; add-only, **no revoke** | Integrations → Browser | NEW revoke IPC |
| Firecrawl `url`, `composeDir` | `integrations.json` → Integrations | Integrations | MOVE |
| Skills (user GitHub skills, enable/disable) | `integrations.json` `skills[]` → Integrations | Integrations | MOVE (this is the skills allowlist) |
| Plugins enable/disable | career-ops `config/plugins.yml` → Integrations | Integrations | MOVE |
| Job-board sources | `portals.yml` → Integrations "Job sources" + Boards screen | Boards screen | STAY (per-board data, not settings). Integrations "Job sources" category becomes a link to Boards |
| Per-board fetch mode/guidelines | `portals.yml` → BoardEditor | — | STAY (per-record) |
| Scan history | `scan-history.ts` / `run-logs/` → Boards Scans | — | STAY; retention goes to Data & Privacy |
| Run history / logs | `runs.jsonl`, `run-logs/*.log` — **unbounded, no UI** | Data & Privacy | NEW retention days + "Clear" |
| Chat threads | `threads/*.json`, caps 500/200 hardcoded | Data & Privacy | Clear-all only (caps stay) |
| Doc generation defaults `{tone, length, humanize, voiceSample}` | per-call only, never persisted (`docs-gen/types.ts:18`) | Resume & Documents | NEW persisted defaults; per-doc override stays contextual |
| Template (active resume template) | career-ops `config/profile.yml` `template` → Resume DocumentStage | — | STAY (contextual, picked while viewing the doc). Settings shows read-only chip |
| `page_format` a4/letter | profile.yml, **no UI** | Resume & Documents | NEW editor (writes same YAML key) |
| ATS options | none persisted (`MAX_ROUNDS`, etc. hardcoded) | Resume & Documents | no new knobs; show "Local model" status + link |
| Agent permission mode (claude `acceptEdits`, codex `workspace-write`, agy sandbox, opencode ask-list) | hardcoded `runner.ts:113-134` | Agent | READ-ONLY table of "what each runner may do". `CLAUDE_TOOLS` allowlist stays hardcoded (security; code comment says "make it a setting if needed" — not needed) |
| Eval concurrency | none — strictly sequential `jobs-batch.ts:195` | Jobs & Boards | READ-ONLY note. No knob (16 GB Mac, per-job CLI worker) |
| Copilot STT engine/model/device/endSilence/vocab | `copilot.json` → Copilot Transcription page | Copilot (Settings) | MOVE |
| Copilot answer engine (tier, models, OpenRouter privacy flags, factCheck, vision, autoAnswer) | `copilot.json` → Copilot Engine page | Copilot (Settings) | MOVE |
| Copilot retention, redact, Privacy mode (hide-from-capture, indicator…) | `copilot.json` → Copilot Privacy page | Copilot (Settings) | MOVE; consent/localOnly stay disabled-by-design |
| Copilot coaching (shape/length/tone/persona), overlay appearance, hotkeys, audio device | `copilot.json` → Copilot pages | — | STAY: tuned while previewing the live overlay / during a session; Settings shows a summary + link |
| Copilot practice, sessions, setup | `copilot.json`, store | — | STAY (actions, not settings) |
| Monitoring range (30d), Jobs filters/views, sidebar collapse, last section, onboarding step, copilot selection | localStorage | — | STAY (view state, per viewer) |
| Monitoring insight thresholds (`metrics.ts:106`) | hardcoded | Monitoring | no knob; read-only list of what triggers findings |
| Overlay appearance vs app theme | `copilot.json overlay.theme` vs `careerloom.theme` | — | STAY separate; labelled "Overlay" so they are not confused |

## 3. Secrets map (all of them)

| Secret | Store | Format check | Used by |
|---|---|---|---|
| `openrouter.key` | safeStorage file 0600 | `/^sk-or-[\w-]{10,}$/` | API runner (`OPENROUTER_API_KEY` env, log-masked), Copilot live (`live.ts:16`), `defaults.ts:106 hasKey` |
| `opencode.key` | safeStorage file 0600 | `/^[\w.-]{16,200}$/` | opencode CLI env, Zen runner, browser-fetch |
| `firecrawl.key` | safeStorage file 0600 | **none** (add non-empty/length) | Firecrawl scrape auth |
| plugin `requiredEnv` | career-ops `config/.env` 0600 | `KEY_RE` | career-ops plugin scripts |
| Chrome Safe Storage key | in-memory only, never persisted | — | cookie decrypt for browser boards |

IPCs that return anything key-related today: `getSettings` (`hasApiKey`, `hasOpencodeKey`), `setApiKey` (boolean), `getIntegration` (`'set'`/null for secret fields), copilot `hasKey`. No IPC returns a secret value. Gaps: no key for Firecrawl in `getSettings`; no `last 4`; no test; no `lastTested`.

## 4. Operational tunables found in code

Hardcoded and **staying hardcoded** (safety/perf, not user-facing): timeouts (`runScript` 120 s, readiness 20 s, sidecar 180 s, Firecrawl set), agent/JD caps, Zen `MAX_TURNS 80`, ATS rounds, metrics thresholds, Claude tool allowlist, window sandbox.
Hardcoded and **surfaced read-only** (info table on Advanced → "Limits"): eval sequential, update interval, scan caps (`MAX_JOBS 200`, `MAX_PAGES 3`), browser nav/scroll limits.
Promoted to **settings**: refresh cadence, language, updates on/off, run-log retention, doc defaults, page format, browser `pageWait` (already), Copilot (already).

## 5. Defects found in the audit (fix as part of the rebuild)

1. `refreshCadence`/`usePolled` promise a "Settings > General" cadence control that does not exist; no `RefreshCadenceContext.Provider` is mounted so cadence is always 60 s.
2. `i18n` exposes `LOCALES` + `setChoice` "for the Settings picker"; no Provider/picker exists.
3. `helperModels` is read only by `job-view/agent.ts`; humanize/ATS/docs-gen don't honour it — Settings copy must not claim otherwise (verify during WP-C, wire if trivial).
4. `settings.json` and `integrations.json` writes are non-atomic shallow merges; a corrupt file silently resets to defaults (and the key-presence flags still read from `*.key`). → atomic write + one `.bak`.
5. `runs.jsonl`, `run-logs/`, `cv-pdf-cache/` grow forever.
6. `setupCareerOps`/`installCareerOpsDefault` write `root` without running readiness.
7. `browser.acks` cannot be revoked. `MAX_WAIT_S` is 60 in `browser-login.ts:78` but 30 in `browser-args.ts:31` — one clamps silently; validate in the editor with the smaller bound or unify.
8. Firecrawl key has no format validation; `launchTask` (zen) path does not mask secrets in logs (verify no key is in its env/log).
9. Three duplicated key editors and three embeds of `LocalModelSetup` / runner pickers (Onboarding, Settings, Copilot).
10. Static copy "see Settings" in toasts (`App.tsx:88-89`), `Ats.tsx:65`, `Overview.tsx:30` is not a link.

## 6. Entry points that must keep working

⌘, (settings), ⌘7 (integrations → redirect to `settings` page `integrations`), Sidebar Integrations item (removed; Settings item shows attention dot), Command palette "Go to" items, Overview "Open Settings", Agent "Open settings" (`careerloom:navigate` with `'settings'`), `goToIntegrations()` callers (`AddWebBoardDialog`, `useStartScan`, `BoardEditor` browser login), Onboarding step links, runner-switched / no-CLI-ready toasts. `localStorage careerloom.section = 'integrations'` must map to `settings`.
