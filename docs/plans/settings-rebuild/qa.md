# Settings rebuild: real-app QA

Run on a **cloned profile** (`--user-data-dir` copy, Singleton locks removed, `opencode.key` and `Cookies*` not copied) with a copied career-ops folder (settings `root` repointed). Real app data, the real career-ops folder and /Applications/Careerloom.app were never touched. Keys were FAKE sentinels; "Test" used the provider 401 path (no spend). Driver: `scripts/settings-qa/*.mjs` over CDP. Raw results: `evidence/QA/results.jsonl`.

| Area | Check | Result | Detail |
|---|---|---|---|
| pages | `page-general` | PASS | renders dark + light, no error banner (evidence/QA/general-{dark,light}.png) |
| pages | `page-runners` | PASS | renders dark + light, no error banner (evidence/QA/runners-{dark,light}.png) |
| pages | `page-keys` | PASS | renders dark + light, no error banner (evidence/QA/keys-{dark,light}.png) |
| pages | `page-local-models` | PASS | renders dark + light, no error banner (evidence/QA/local-models-{dark,light}.png) |
| pages | `page-integrations` | PASS | renders dark + light, no error banner (evidence/QA/integrations-{dark,light}.png) |
| pages | `page-jobs` | PASS | renders dark + light, no error banner (evidence/QA/jobs-{dark,light}.png) |
| pages | `page-resume` | PASS | renders dark + light, no error banner (evidence/QA/resume-{dark,light}.png) |
| pages | `page-agent` | PASS | renders dark + light, no error banner (evidence/QA/agent-{dark,light}.png) |
| pages | `page-copilot` | PASS | renders dark + light, no error banner (evidence/QA/copilot-{dark,light}.png) |
| pages | `page-monitoring` | PASS | renders dark + light, no error banner (evidence/QA/monitoring-{dark,light}.png) |
| pages | `page-data` | PASS | renders dark + light, no error banner (evidence/QA/data-{dark,light}.png) |
| pages | `page-advanced` | PASS | renders dark + light, no error banner (evidence/QA/advanced-{dark,light}.png) |
| nav | `shortcut-cmd-comma` | PASS | section=settings |
| nav | `palette-settings-entry` | PASS | items=["Settings: Refresh cadenceGeneral"] page=General |
| search | `search-retention` | PASS | hits=["Run-log retentionData & privacy","Copilot privacyCopilot"] page=Data & privacy |
| search | `search-theme` | PASS | → General |
| search | `search-openrouter` | PASS | → API keys |
| search | `search-firecrawl` | PASS | first hit is the Firecrawl key (API keys); Integrations is the second hit. Correct by label ranking. |
| search | `search-reset` | PASS | → Advanced |
| search | `registry-ids-exist` | PASS | 45 entries |
| deep link | `deeplink-general-theme` | PASS | pulsed=true |
| deep link | `deeplink-general-refresh` | PASS | pulsed=true |
| deep link | `deeplink-jobs-prescreen` | PASS | pulsed=true |
| deep link | `deeplink-copilot-copilot:stt` | PASS | pulsed=true |
| deep link | `deeplink-copilot-copilot:privacy` | PASS | pulsed=true |
| deep link | `deeplink-keys-key:openrouter` | PASS | pulsed=true |
| deep link | `deeplink-runners-runner:claude` | PASS | pulsed=true |
| deep link | `deeplink-data-danger` | PASS | pulsed=true |
| deep link | `deeplink-local-models-stt-models` | PASS | pulsed=true |
| deep link | `legacy-integrations-remap` | PASS | page=Integrations |
| deep link | `chip-jobs` | PASS | found=true page=Jobs & boards |
| deep link | `chip-agent` | PASS | found=true page=Runners & models |
| deep link | `chip-copilot` | PASS | found=true page=Copilot |
| deep link | `boards-integrations-link` | PASS | section=settings page=Integrations |
| deep link | `boards-link-visible-or-gated` | not run | not exercised: the link only renders in the browser-board editor / Firecrawl-down states; the navigate target itself passes (boards-integrations-link) |
| deep link | `copilot-chip-copilot:stt` | PASS | clicked=true page=Copilot target present=true |
| deep link | `copilot-chip-copilot:engine` | PASS | clicked=true page=Copilot target present=true |
| deep link | `copilot-chip-copilot:privacy` | PASS | clicked=true page=Copilot target present=true |
| deep link | `copilot-stt-install-defers` | PASS | {"install":false,"chip":true,"tab":"Local models","target":true,"pulse":false} |
| keys | `keys-initial-not-set` | PASS | OpenRouter / Not set /  / Used by: API runner · Interview Copilot answers /  / Add key |
| keys | `keys-add-saved-masked` | PASS | OpenRouter / Saved / ••••cdef /  / Used by: API runner · Interview Copilot answers /  / Test / Replace / Remove |
| keys | `keys-input-cleared-after-save` | PASS |  |
| keys | `keys-test-401` | PASS | sed by: API runner · Interview Copilot answers /  / Test / Replace / Remove / Invalid key — OpenRouter rejected it · 77 ms · tested just now |
| keys | `keys-replace-escape-cancels` | PASS | Esc discards typed value, old key kept |
| keys | `keys-replace` | PASS | OpenRouter / Saved / ••••wxyz /  / Used by: API runner · Interview Copilot answers /  / Test / Repla |
| keys | `keys-remove-confirm-dialog` | PASS | Remove the OpenRouter key? /  / API runner and Interview Copilot answers will stop working until you add a key again. The key is deleted fro |
| keys | `keys-remove-cancel-keeps` | PASS |  |
| keys | `keys-remove` | PASS | OpenRouter / Not set /  / Used by: API runner · Interview Copilot answers /  / Add key |
| keys | `keys-no-secret-in-renderer` | PASS | DOM, localStorage, sessionStorage clean |
| data | `data-locations-listed` | PASS | user-data folder + career-ops root shown (clone paths) |
| data | `data-show-in-finder` | PASS | toast="" |
| data | `data-reveal-refuses-unlisted-path` | PASS | refused: Not a data location |
| data | `retention-prune-disabled-when-forever` | PASS |  |
| data | `retention-set-30-undo-toast` | PASS | days=30 toast="Run-log retention: 30 daysUndo" |
| data | `retention-undo` | PASS | days=null |
| data | `retention-prune` | PASS | files 21 → 18 (3 old removed, fresh kept) toast="Removed 3 log files · freed 45 B" |
| general | `updates-opt-out` | PASS | enabled=false |
| general | `updates-opt-out-undo` | PASS |  |
| runners | `runners-readiness` | PASS | Active: OpenCode · Ready. The runner does the work: reads job posts, scores them and tailors your résumé. / Claude Code / Ready / Uses your Claude subscription. Can edit  |
| local-models | `local-models-status` | PASS | 0.1 GB free of 16.0 GB / Pre-screens jobs on your computer — job titles never leave it. Installed. / Base model trained on public data. Contains ESCO data. © European Uni |
| advanced | `advanced-diagnostics` | PASS |  |
| integrations | `browser-acks-listed` | PASS | ["reltio.com","linkedin.com","glassdoor.com","naukri.com"] |
| integrations | `browser-ack-revoke` | PASS | 4 → 3 |
| persistence | `persist-set` | PASS | {"theme":"light","keys":["careerloom.refreshInterval","careerloom.pipelineFilters","careerloom.section","careerloom.jobFilters","careerloom.reportSnapshot.v1.tracker","ca |
| persistence | `restart-theme` | PASS |  |
| persistence | `restart-language` | PASS | locale=fr lang=fr |
| persistence | `restart-refresh-cadence` | PASS |  |
| persistence | `restart-updates-opt-out` | PASS |  |
| persistence | `restart-doc-defaults` | PASS |  |
| reset | `reset-preferences` | PASS | updates=true tone=warm root kept=true runner kept=true |
| reset | `reset-preferences-view-state` | PASS | theme after reset=null locale=null cadence=null |
| reset | `reset-everything-typed-confirm-gate` | PASS | {"disabled":true,"placeholder":"Type RESET to confirm"} |
| reset | `reset-everything` | PASS | keys left=0 root kept=true runner kept=true |
| reset | `career-ops-folder-untouched` | PASS | /private/tmp/claude-501/-Users-perkypanda-orca-workspaces-Careerloom-settings-qa/f38327e6-f2d7-44cc-8c67-76eb2091fca3/scratchpad/qa/career-ops |

**74 checks: 73 pass, 0 fail, 1 not exercised.** (Two early checks were removed as mis-specified: `panic` is not a Settings search term, and the Monitoring screen has no Refresh chip; both live elsewhere by design.)

## Bugs found and fixed (tests first)

- Search ranked keyword hits above label hits (`retention` jumped to Copilot privacy, `openrouter` to Runners): label matches now rank first (`settings-registry.test.ts`).
- 12 registry ids had no matching control on E/D pages (Copilot used `copilot-stt` vs the pages' `copilot:stt`; Integrations rows, Jobs/Resume/Agent/Monitoring groups had no id), so search and ⌘K opened the page without pulsing. Ids fixed or added; "Page format" had no control and was dropped. Guarded by a source check test and `scripts/settings-qa/registry.mjs` (live DOM, 45 entries).
- Two attributes (`data-focus`, `data-setting-id`) merged into `data-setting-id`.
- Duplicate `SettingChip` (kit.tsx) removed; Copilot STT "Install" now a chip into Local models; unused `settings/PageStub.tsx` deleted.
- Undo toast added to doc defaults, Monitoring retention and runner switch (theme, language, refresh, updates, Data retention already had it).

## Secrets

`grep -r QASENTINEL` over the clone profile (including run-logs, Local Storage, text-runs) and the Electron stdout log: **0 hits**. Renderer DOM, localStorage and sessionStorage clean after add / replace / remove. Screenshots show only `••••` masks and the last four characters.

## Remaining gaps

- Memory badge (fixed after QA): main now reports free + inactive + speculative pages from `vm_stat` (`electron/settings/memory.ts`, parsed-output unit test, falls back to `os.freemem()`); the clone reading went from 0.1 GB to 3.2 GB while `memory_pressure` shows 39% free. Re-verified by calling the module on this Mac, not re-screenshotted.
- No successful provider test (needs a real key); only the 401 path. Windows untested. Boards editor "Browser login settings" link and the Firecrawl-down link not exercised live.
- "Show in Finder" opens a real Finder window on the clone folders (verified no error; window not asserted).
- Panic/hotkey settings live in the Copilot workspace, not Settings search by design.
