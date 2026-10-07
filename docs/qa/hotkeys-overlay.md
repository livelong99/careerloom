# QA: hotkeys + overlay (branch livelong99/hotkeys-overlay, base bdd872d)

Method: vitest + RTL first (both platform default sets, rebinding, conflicts, registration failure, host routing), then one real Electron pass on a cloned profile (electron lock taken and released, no model, no network).

## Fixed

| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 1 | `electron/copilot/overlay-host.ts` publishState | Every state change while capturing (armed → listening …) re-ran `overlay.open()`, so a overlay hidden with Show/Hide or Quick hide popped back up; it also re-registered every hotkey and re-published failed-registration errors | open + register only on the transition into capturing |
| 2 | overlay-host `onHotkey` toggle | Show/Hide while quick-hidden showed the window still wiped and left `quickHidden` true, so the next Quick hide "showed" instead of hiding | toggle while quick-hidden → `quickHide:false`, flag cleared |
| 3 | overlay-host | A held answer key auto-repeats (worst on Windows): each repeat aborted and restarted the answer (wasted tokens) | 400 ms per-action repeat guard on answer-type actions; panic and window keys unthrottled |
| 4 | overlay-host + `live-wiring`/`defaults.ts` | **Listen hotkey did nothing** (routed to listeners nobody handled), yet the idle card says "press ⌃⌥L" | Listen stays registered on a visible stopped card and starts a session (same path as the Start button; refused with the existing "start from Careerloom" toast when there was no confirmed start); ignored while listening; freed when the card is hidden/panic. Row relabelled "Start listening" |
| 5 | `overlay-host` registration error | `Control+Alt+A could not be registered (in-use)` | names the action, the reason in words and where to fix it |
| 6 | `hotkeys.ts` | duplicate detection was exact-string: `alt+control+x` vs `Control+Alt+X` both "registered" | order/case/alias-insensitive `sameAccelerator`, used by `registerAll`, `check` and the Hotkeys page |
| 7 | `hotkeys.ts` | Windows system keys (Alt+F4, Alt+Tab, Ctrl+Alt+Del, Ctrl+Shift+Esc, Win+L) accepted | reserved |
| 8 | `config.ts` | a saved invalid/reserved accelerator failed registration every session | falls back to the default on read |
| 9 | `HotkeyRow.tsx` | Hotkeys page showed mac glyphs (⌥⇧A) on Windows; Win key recorded as `Command` (invalid on Windows) | `kbdLabel` (same helper as the overlay), `Super` on Windows; `kbdLabel` keeps `Space`/`Up` readable |
| 10 | `Hotkeys.tsx` | clash error did not say which action owns the key; no confirmation after saving; platform defaults computed at import; bare key while recording silently ignored | owner named (incl. Stop), success toast, defaults per render, "Add Ctrl, Alt or Win, then a key" hint, note that shortcuts work only during a session |
| 11 | `overlay-runtime.ts` | overlay never re-anchored when a monitor was added/removed or the work area changed | `display-added/removed/metrics-changed` → `overlay.refresh()` |

## Tests added
- `hotkeys.test.ts` +8 (Windows reserved, alias duplicates, `only` subset)
- `overlay-host.test.ts` +7, 1 updated (no re-show/re-register, toggle vs quick hide, repeat guard, panic not debounced, failure message, Listen on stopped card, hide frees Listen)
- `config.test.ts` +1, `Hotkeys.test.tsx` (new, 6: Windows labels/Super, duplicate + owner naming, Stop clash, toast, bare-key hint, session note), `pages-hw.test.tsx` message updated.

## Real Electron pass (cloned profile, fake overlay driver, lock `/tmp/careerloom-electron.lock` released)
Screenshots in `docs/qa/hotkeys-overlay-shots/`: strip + panel × dark + light × listening + answered, all render correctly (strip 780×96, panel 480×700 per width setting, chips show the user's custom bindings). Global hotkey firing, click-through hit-testing and multi-display were not driven for real (no accessibility permission for synthetic key events, single display): covered by unit tests only.

## Unresolved
- `kb.voice.pushToInterrupt` (the "interrupt" key) is stored, migrated and shown in settings but never registered anywhere, so it is inert. Belongs to the voice/KB owner.
- Windows: all of the above untested on a real Windows machine (AltGr behaviour, `Super` accelerators).
- Panic wipe is "close the window": a new session starts from replayed state only; verified by unit tests, not visually.
