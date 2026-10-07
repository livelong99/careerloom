# Other-features regression QA (non-Copilot)

Branch base `bdd872d`. Baseline: typecheck clean, 2156 tests pass. After: 2165 pass.

## Real-app pass (cloned profile, cloned career-ops, 5.3k-job pipeline)
- 9 screens × dark+light at 1240 px and 900 px (window min width): 0 console errors/exceptions, no horizontal overflow, heap 10–18 MB idle.
- Jobs with 5,287 real rows: sort 65 ms, filter 48 ms, heap 64 MB (table pages at 300). Filter+facets on 5k synthetic rows: 17 ms.
- Command palette: opens on ⌘K, filters, closes on Esc.
- **Bug found live:** persisted Jobs filter held 7 portal ids that no longer exist (starter-pack switch) -> empty table, chips showing raw `source:anthropic`. Fixed (`pruneStalePortals`); verified in the app.

## Fixed
| Where | Issue |
|---|---|
| `electron/integrations/browser-args.ts` | Playwright MCP launched as bare `npx`; CLIs spawn MCP without a shell so it fails on Windows (`npx.cmd`). Now `cmd /c npx` on win32 (+test). |
| `electron/fit-sidecar.ts:212` | Python sidecar read stdin in the Windows ANSI code page: non-ASCII job text garbled. Sets `PYTHONUTF8/PYTHONIOENCODING`. |
| `electron/jobs-batch.ts` | Cleanup error in a worker's `onExit` stalled the whole evaluate chain (+unhandled rejection); report number leaked when template/JD setup failed. Now try/finally always advances; template read before reserving; release on failure. |
| `electron/jobs.ts` | Double-click Evaluate started duplicate workers (`evaluatingJobIds`, +test); concurrent scans now refused. |
| `electron/updates.ts` | Failed check (offline / private repo 404) re-requested on every poll: 5-min backoff. `compareSemver` used `Number()` on `0-beta`. (+tests) |
| `electron/integrations/sources.ts` | `portals.yml` written non-atomically; now temp+rename. |
| `electron/tts/say.ts` | Windows SAPI: PowerShell treats curly quotes as quotes; voice id could break out of the string. All four quote chars doubled (+test). |
| `electron/tts/service.ts`, `runtime.ts` | Selected voice id was applied to whichever engine was first in the chain (uninstalled Kokoro -> `say -v af_heart` fails); preview with default voice failed. Voice now bound to its engine (+test). |
| `electron/kb/research/pipeline.ts` | Stop during generate still committed a `complete` KB (abort swallowed by classify/enrich). `throwIfAborted` before dedupe and commit. |
| `electron/kb/bm25.ts` | ASCII-only tokenizer dropped accented/non-Latin text (retrieval empty). Unicode letters/digits (+test). |
| `electron/kb/research/robots.ts` | empty `User-agent:` matched as a named group. |
| `electron/kb/store.ts` | research re-find overwrote provenance of user-added items. |
| `electron/interviewer/handlers.ts` | job id cap 500 vs 2000 elsewhere. |
| `renderer/App.tsx` | `<Job>` had no key: prev/next job showed previous job's data and run state. |
| `renderer/sections/Jobs.tsx` | Bulk actions acted on rows hidden by a filter (selection ∩ shown); saved scroll was always 0 (ref detached before cleanup); `listJobs` error showed "No jobs found". |
| `renderer/hooks/useRuns.ts`, `lib/jobNav.ts` | unhandled rejections on cancel / open application. |
| `renderer/sections/Monitoring.tsx` | range switch showed previous range's data (no memoKey). |
| `renderer/components/boards/BoardEditor.tsx` | stale `getPortal` response could overwrite the newly opened board (Save would write A into B). |
| `renderer/sections/resume/Content.tsx` | selected section index could exceed sections after reload (edits discarded). |
| `renderer/components/job/useJobAts.ts` | `loading` always false. |
| `renderer/lib/types.js(.map)` | stale tracked build artefacts next to `types.ts` (could shadow it); removed. |

Tests added: browser-args (2), filters.perf (1), pruneStalePortals, evaluatingJobIds, updates backoff/semver, say curly quotes, tts voice ownership, bm25 unicode.

## Unresolved (reviewed, not fixed)
- **SSRF DNS rebinding** (`kb/research/fetch.ts`, firecrawl tier): resolve-then-fetch re-resolves. Needs an IP-pinning undici dispatcher (new direct dependency) — decision needed. IPv6 NAT64/6to4/multicast ranges also not blocked (`firecrawl-client.ts` `isPrivateIPv6`).
- ATS events are not filtered by job/run id (`useJobAts.ts`, `resume/useAts.ts`): an analysis elsewhere flips every mounted job's "Analysing…". Needs `jobId` on `AtsEvent` through `ats/analyze.ts`.
- Echo gate has no watchdog (copilot area, not touched); KB `retentionDays`/`maxItems` settings are stored but never enforced; research budget can overshoot by in-flight calls; Kokoro requests have no timeout and stdin EPIPE is unhandled; cdp/firecrawl tiers ignore abort and a cdp failure skips Firecrawl; KB export includes user-hidden items, import trusts `id`/`user`.
- Run history `runs` Map + `runs.jsonl` grow unbounded; `listReports` reads every report in full per call; portals matched by name (duplicates); `addWebBoard` duplicate check races; `careerloom-web-boards.json`/hidden-jobs writes non-atomic; web-board failures in a mixed scan only logged; evaluate chain failures after job 1 only logged.
- UI: error states missing on Boards › Scans, Onboarding prerequisites/settings, App settings load, Resume partial failures; `useRuns` streams every log chunk through app-wide context (re-render pressure); Agent composer loses focus while sending; Runs/Agent fixed first columns tight at 900 px; chart tooltips hover-only; Bulk "Tailor CV/Draft answers" lack a busy guard; `RunList` "Open job" `tabIndex=-1`.
- Not exercised in the real app: Windows (code review only), live network scans/evaluates, TTS audio, Onboarding flow on a fresh profile.
