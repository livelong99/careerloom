# Spike S1 — macOS system audio capture (time-boxed, WP3)

Date 2026-10-01. Machine: Apple Silicon MacBook Pro, macOS 27.0 (26A428), Electron 43.7.5 (Chromium 150), dev binary from `node_modules` launched from a terminal app that already holds Screen Recording permission. Harness: `scripts/copilot-e2e/s1-main.cjs` (+ `s1.html`, `preload-s1.cjs`); run with `S1_CLIP=<audio file> S1_MS=11000 electron --user-data-dir=<scratch> scripts/copilot-e2e/s1-main.cjs`. Cloned/scratch profile only; no real app data touched. Cost $0.

## What was tried

| Option | Result |
|---|---|
| (a) `session.setDisplayMediaRequestHandler` returning `{ video: <screen source>, audio: 'loopback' }` + `getDisplayMedia({video:true, audio:true})` | **Works.** Stream returned 1 audio track (`label="System audio"`, `readyState=live`, `muted=false`). While `afplay -v 0.25` played a clip, the per-second peak of the captured track went from `0.0000` (before playback) to `0.59 / 0.39 / 0.48 / 0.51`. Audio is the full mix, not affected by the 0.25 player volume. |
| (b) `{ useSystemPicker: true }` | **Not run.** Opens the native picker and needs a human click; not automatable here. Stays the fallback if (a) breaks on a future macOS (issue #52738 workaround in the plan). |
| (c) Virtual device (BlackHole) via `getUserMedia` | **Device present** on this Mac (`BlackHole 16ch` in `system_profiler SPAudioDataType`) but **routing not exercised**: it needs a Multi-Output device and changes the user's default output, which a spike must not do silently. Keep as the documented user-side fallback (`audio.systemSource: 'virtual'`). |
| (d) Mic-only | Already shipped by WP3 (see below). |

Numbers (single run, not a benchmark): handler reached 2.1 s after app ready; `getDisplayMedia` resolved **4.3 s** after the handler (first-start cost, the UI must show "Starting system audio…"); first non-zero audio within 1 s of playback start.

## Permission behaviour (what was and was not measured)

- Status reads on the launching app: `getMediaAccessStatus('screen') = granted`, `('microphone') = granted`. **The denied / not-determined path was not exercised**: revoking the terminal's permission would change the user's real TCC state.
- **Silent-track detector on a dead track (measured, mic path):** a Chromium fake capture device whose file could not be read (audio sandbox blocked it) produced a live track delivering digital zeros. No error was raised; `copilotHealth{status:'silent'}` fired **2.5 s after the session reached `listening`** (limit: within 3 s). Unit test with a fake clock: fires between 2.50 s and 2.75 s after the last non-zero sample (`SILENT_MS=2500`, tick 250 ms). The same detector is source-agnostic, so a permission-less system track (silent or absent) is covered the same way.
- **TCC across updates / ad-hoc signing: NOT tested.** It needs a packaged, ad-hoc-signed build that has its own TCC identity. The product's bundle id equals the installed Careerloom.app's, and a prompt from a QA build could corrupt that app's permission state, so this was deliberately skipped. Expectation (unverified): each ad-hoc build gets a new code identity, so macOS re-asks for Screen/System-audio permission after every update until builds are signed with a stable identity (Developer ID + notarization). Verify in integration with a QA app id.
- `NSAudioCaptureUsageDescription` and `NSMicrophoneUsageDescription` are now in `build.mac.extendInfo` (package.json) and `build/entitlements.mac.plist` carries `device.audio-input`. Whether `audio:'loopback'` on this macOS goes through ScreenCaptureKit (Screen Recording) or a CoreAudio tap (System Audio Recording) was not distinguishable with both permissions granted. The Settings pane id `Privacy_AudioCapture` in `audio-perms.ts` is unconfirmed.

## Recommendation for gate G-B

**GO for macOS system audio via option (a) `audio:'loopback'`, Apple Silicon, macOS 14+ as tested on 27.0, as M2 (not in M1).** Conditions before it ships: (1) verify the denied/not-determined flow and the TCC-reset-on-update behaviour in a QA-app-id packaged build; (2) show the 4 s start state; (3) keep (b) and (c) as documented fallbacks; (4) Intel and macOS 14/15 untested. Mic-only remains the M1 default; system audio stays off by default and behind the consent gate. No system-audio feature code was built (only this harness).
