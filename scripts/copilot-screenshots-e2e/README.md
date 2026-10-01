# Screenshot path QA (cloned profile, fake OpenRouter, no key, no spend)

Dev-only. Never point this at the real profile, career-ops folder or installed app. One Electron instance at a time.

1. Clone the profile + career-ops as in `../copilot-int-e2e/README.md`; set `root` in the clone's `settings.json` to the copy.
2. `$QA/e2e.json`: `{"baseUrl":"http://127.0.0.1:8788/api/v1","sttFixture":"<this dir>/live-shot.jsonl"}`.
3. `node fake-vision-openrouter.mjs 8788 $EV` (logs every request's content parts and saves the first received JPEG).
4. Optional crash-recovery check: put a stale `shot-1-1.jpg` in `$(getconf DARWIN_USER_TEMP_DIR)careerloom-copilot-shots/` before launch (Electron ignores `$TMPDIR` on macOS).
5. `CL_COPILOT_E2E=$QA/e2e.json electron . --user-data-dir=$QA/profile --remote-debugging-port=9333 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --disable-features=AudioServiceSandbox`
6. `SHOT_TMP=$(getconf DARWIN_USER_TEMP_DIR) EV_DIR=$EV THEME=dark|light END=stop|panic|quit node run.mjs`

`run.mjs` fills the display with a harmless test page, so the real capture contains nothing of yours; still view `received.jpg` before keeping it (the committed copy is cropped to the page). Relaunch the app between runs: a session started after a panic can fall back to practice mode.
