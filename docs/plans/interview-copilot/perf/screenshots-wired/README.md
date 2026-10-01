# Screenshot path: real-app evidence (SS)

Real Electron on a cloned profile (`--user-data-dir` copy, copied career-ops), fake OpenRouter on 127.0.0.1 (no key, no spend), real `desktopCapturer` capture of a harmless full-screen test page. Harness: `scripts/copilot-screenshots-e2e/`.

| Check | Result |
|---|---|
| Stale frame from a crashed run swept at app start | pass (`shot-1-1.jpg` removed before the first window) |
| Small talk ("can you see my screen okay?") | no capture, no frame on disk |
| Coding question that points at the screen | one frame pre-captured at end of turn (1 file) |
| Screenshot button -> answer | request has `["image_url","text"]` parts, `data:image/jpeg;base64,` JPEG (magic `ffd8`), 41 KB; `requests.jsonl` |
| Image reached the provider | yes, first received frame saved by the fake server: `received-cropped.jpg` (cropped to the test page; shows the QA text, no overlay: it was hidden during capture) |
| Button state after answer | `Sent` (then back to `Screenshot` after 2.5 s) |
| Frames after session stop / panic / app quit | `[]` / `[]` / `[]` |
| Non-vision model (accidental practice-mode run) | button `Not a vision model` + "This model can't read images. Try openai/gpt-4.1-nano."; request went out text-only, no image |

Overlay shots (dark + light, question / capturing-or-sent / answered): `overlay-{dark,light}-*.png`. The overlay is clipped on the right in these because the harness emulates a 600 px viewport, not the real window width; the Screenshot row wraps to a second line at this width exactly like the other buttons.

Not covered live: Screen Recording **denied** (the test Mac already grants it to the dev Electron; the denied path is covered by `live-wiring-screen.test.ts` and `ActionRow.test.tsx`), and the real provider call (no key).
