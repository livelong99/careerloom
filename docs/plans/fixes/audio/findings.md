# FIX-AUDIO findings

Checked end to end in the real Electron app on a cloned profile (fake mic WAV, `--disable-features=AudioServiceSandbox`, no real microphone, no model loaded, $0). Evidence: `audio-before-*.png`, `audio-after-*.png` (dark + light), `audio-*.json`, `start-after-dark.png`.

## What was wrong
| # | Defect | Evidence |
|---|---|---|
| 1 | **`npm run dev` could never use the mic.** The permission allowlist matched `localhost` only; the dev server is `127.0.0.1`. `getUserMedia` → `NotAllowedError`, and the page said "No input device found". | before: meter 0, "No input device found."; `getUserMedia` = `NotAllowedError: Permission denied` |
| 2 | **The saved config has `stt.engine = faster-whisper`**, an entry the Engine dropdown offered but that has no adapter. Every session start threw "not available yet". | cloned `copilot.json` |
| 3 | The default engine (Whisper MLX) is **not installed** on this Mac (`~/.careerloom/stt` absent). Start failed with "Local speech model is not installed", with no next step. | `start-after-dark.png` |
| 4 | A mic that delivers **no frames** (device failed to open, worklet never ran) was reported as "silent" and showed macOS permission steps. | unit test |
| 5 | A saved device that is gone (ids differ between dev/packaged origins and after unplugging) made `getUserMedia({deviceId:{exact}})` fail; the dropdown went blank. No fallback. | before: saved id absent from list |
| 6 | A device that vanishes **mid-session** (unplugged headset) ended the track and nothing reopened it. A suspended `AudioContext` would also deliver no frames and no error. | unit tests |
| 7 | Audio page: the level meter opened a **second** stream on the same device; the real open error was swallowed ("No input device"); no hot-plug refresh; Chromium's duplicate `default`/`communications` entries; the fix steps needed a job to be picked. | page tests |
| 8 | **System audio** toggle, source picker and permission test were offered, but capture is not built (session only opens `mic`). | `audio-before-*-idle.png` |
| 9 | No `setPermissionCheckHandler`; camera requests were not refused. | main.ts |

### How `faster-whisper` got into the saved config
WP0's first config default was `engine: 'faster-whisper'` (commit f2e4db9). Config writes persist the whole normalised file, so the first write on the user's machine froze that default; commit 77d11b9 later changed the default to `defaultEngine()` (Whisper MLX on Apple silicon) but never migrated existing files, and the Engine dropdown still offered the option. Fixed at both ends: stale values normalise to the platform default on read/write (test in `config.test.ts`; the cloned profile came up as `whisper-mlx/small`), and the dropdown option is disabled ("not available").

## What was fixed (test first)
1. `isAllowedPermission` accepts `127.0.0.1`, origins without a trailing slash, refuses video; check handler added (`main.ts`, 4 lines).
2. Config normalisation maps a stale `faster-whisper` to the default engine; dropdown option is disabled ("not available").
3. Adapters fail with "Install the speech model in Settings → Local models, then start again." (also when only another model is installed).
4. Health reports `missing` when no frame ever arrived, plus a `capture` error naming the likely causes; it clears when sound arrives.
5. `startMic`: falls back to the default input when the saved device is gone, resumes a suspended context, maps every DOMException to a sentence; `useMicCapture` reopens (≤5 tries, 1 s apart) when the device ends.
6. Audio page: real inputs only, follows `devicechange`, "Saved microphone (not connected, using system default)", meter driven by the frames actually sent (one stream), the real open error, fix steps after a denied test, system audio shown as "Coming soon" (off, disabled, nothing to configure).

Verified live (fixed build, cloned profile, scratch `CAREERLOOM_STT_DIR`, fake mic playing a spoken sentence, no key, $0):
- Install of Whisper small MLX from an empty directory completed end to end (venv, `mlx-whisper==0.4.3`, model fetch, self-test; `ready.json` written, 1.7 GB on disk). Disk was the tight resource (14 GB free).
- Practice session from the fake mic: Whisper transcribed the spoken sentence verbatim as finals (`you: "Tell me about a time you led a project under a tight deadline. What was the result?"`, 6 times as the WAV looped). The overlay strip shows the question; the "you" lines are in the saved session and the panel layout.
- The fake WAV's digital-zero padding correctly raised "Mic silent" after 2.5 s, as designed. A real microphone is not exactly zero, but see hardware step 4.

Checked and fine: Info.plist mic string and entitlement (packaged), Electron dev plist has a mic string, worklet loads under `file://` and the dev server, 16 kHz resampling and 100 ms framing (existing tests), IPC transport, overlay shares the default session so one handler covers it.

## Needs you on real hardware
1. `npm run dev`, Copilot → Audio → pick your microphone → **Test for 3 seconds** and speak. Expect bars moving and "Working: Careerloom heard sound." First run: macOS asks for the microphone; in dev the prompt names **Electron** (or your terminal), so allow that one. If it says Blocked: System Settings → Privacy & Security → Microphone.
2. Settings → Local models → install the Whisper speech model (about 1.3 GB), then Setup → Start practice and speak: lines appear in the overlay.
3. Unplug the selected USB/Bluetooth mic during a practice session: the overlay should recover on the default input within about 5 s, or show "Audio capture problem" with a reason.
4. AirPods/Bluetooth: opening the mic switches the headset to its call profile, which can send zeros for 1–3 s. If the overlay flashes a silent warning at start, tell me and I will add a start-up grace period.
5. Plug a second mic in with the Audio page open: it should appear without reopening the page.

Not changed: the 2.5 s silent threshold, system audio capture (M2).
