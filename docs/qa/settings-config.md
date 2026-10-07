# QA: Settings + Config (branch livelong99/settings-config, base bdd872d)

Scope: Copilot and general Settings pages, copilot.json / settings.json normalisation, Advanced › Debug log, keys, reset.
Method: code audit of every control, vitest/RTL tests with fakes, one real Electron pass on a cloned profile
(scratch copy of the app data folder + copied career-ops folder, `settings.json` root repointed and `debug.dir` cleared,
Singleton locks not copied; the user's real data and the installed app were never touched).

## Issues found and fixed

| # | Where | Problem | Fix | Test |
|---|-------|---------|-----|------|
| 1 | `electron/copilot/config.ts:75` | `stt.engine` allow-list lacked `parakeet`. Picking NVIDIA Parakeet (offered on every platform) was saved, then normalised back to the platform default, so on macOS the choice silently reverted. | add `'parakeet'` | `config.test.ts` "parakeet … is kept" (failed before) |
| 2 | `renderer/components/copilot/api.ts` `useCopilotConfig.save` | Stale-reply race: every keystroke/slider tick sends a save; an earlier reply landing after a newer optimistic edit overwrote it (persona text lost characters, sliders jumped back). A failed old save could also revert a newer edit. | sequence counter: only the newest save may write state / revert | `api.test.tsx` (failed before) |
| 3 | `settings/usePrefs.ts` | same race (retention days, doc defaults, debug folder) | same fix | `usePrefs.test.tsx` |
| 4 | `settings/pages/InterviewPrep.tsx` `useInterviewConfig` | same race (limits, voice, sources) | same fix | covered by the pattern; Interview prep suite green |
| 5 | `electron/debug-log.ts` masking | Only `sk-` strings and a few key names were masked. `Authorization: Bearer …` in console text, `?key=` / `token=` URL params, Firecrawl `fc-` and Brave `BSA` keys, `refresh_token`, `clientSecret`, `credential*` were written in clear. | broader key-name regex + free-text regex (Bearer, `fc-`, `BSA…`, `?key=`/`token=` values); `maxTokens`/`promptTokens` stay visible | `debug-log.test.ts` (failed before); live check in the real app: `Authorization: [hidden]`, `?key=…` |
| 6 | `electron/debug-log.ts` `setDebugLogDir` | A deleted/missing folder surfaced raw `ENOENT: no such file or directory, stat '…'`; unwritable folder surfaced a raw errno message. | friendly "Choose an existing folder…" / "Can't write to that folder (EACCES)…" | `debug-handlers.test.ts` |
| 7 | `Engine.tsx` "Read screenshots with" | "Text only (OCR): not available yet" was clickable and saved `vision: 'ocr'`, which blocks screenshots with no UI way to know why. Dead control. | `SegTabs` gets per-option `disabled` (aria-disabled, not focusable, ignores click/Enter); OCR option disabled | `engine-screen.test.tsx` |
| 8 | `Transcription.tsx` vocabulary | no length cap (words > 60 chars were saved then silently dropped by the normaliser), duplicates compared case-sensitively, no 200-word cap | `maxLength=60`, case-insensitive duplicate check, 200 cap | `pages-hw.test.tsx` |
| 9 | `ui/slider.tsx` | Radix puts `role=slider` on the thumb, but `aria-label` was only on the root: the Coaching "Length" and Interview prep "Speed" sliders had no accessible name. | pass `aria-label` to the thumb | `slider.test.tsx` |

## Verified, no change needed

- copilot.json: every field survives restart (checked in the real app: engine, model ids, persona, vocab, overlay, sort); out-of-range values clamp (width 5000 → 1200, opacity 0.1 → 0.6, silence 9999 → 3000, length 7 → default), bad shapes are rejected (`patch must be an object`). Garbage files (array root, `null`, wrong types, 500-word vocab) load as a valid config (`config.test.ts`).
- settings.json prefs: relative / non-string debug folder ignored on load, rejected on write; reset keeps keys/folder/runner as documented.
- Debug log (real app on clone): missing folder refused and not persisted; relative path refused; on → `log started` + environment snapshot with no key material; off → `log stopped`; `revealPath` accepts only data locations and the log folder; a failed switch reverts in the UI with the reason (`advanced-debug.test.tsx`).
- Layout: all 8 Settings pages and the Copilot Audio / Coaching / Appearance pages, light + dark, at the real 900 px minimum window width: no horizontal overflow, no unlabeled controls (after fix 9). Screenshots in `docs/screenshots/settings-config/`.
- Not in the CDP pass because they need a native dialog: the folder picker (covered with a fake bridge) and the macOS permission prompts.

## Unresolved / notes

- The reasoning-ladder "learned" map in `providers/openrouter.ts` is in memory only. After each app launch a mandatory-reasoning model costs one 400 + retry on its first answer. Persisting it to copilot-llm-probes.json is a small follow-up if that latency matters.
- The model **Test** button builds its own provider, so it does not share what the live provider learned.
- Persona text is part of the debug-log environment snapshot (the copilot config is logged whole). Fine for a log the user hands over deliberately, which the UI already warns about; trim if that changes.
- Every slider tick and persona keystroke is one IPC + one atomic file write. Correct now (fix 2) but a debounce would cut disk writes; left out as not user-visible.
- `SegTabs` uses `role=tab` without tabpanels for what are really radio choices, and has no group name. Changing the role breaks 18 existing tests that query `tab`; left as is.
- The `orca orchestration send` CLI failed here ("Unable to determine Orca.app path from symlink: /usr/local/bin/orca"), so heartbeats could not be sent.
