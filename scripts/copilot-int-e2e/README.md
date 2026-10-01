# Copilot integration QA (cloned profile, no key, no spend)

Dev-only. Never point this at the real profile or career-ops folder.

1. Clone: `cp -cR ~/Library/Application\ Support/careerloom $QA/profile`, copy career-ops to `$QA/career-ops`, delete `Singleton*`, `DevToolsActivePort`, `opencode.key`, and set `root` in `$QA/profile/settings.json` to the copy.
2. `$QA/e2e.json`: `{"baseUrl":"http://127.0.0.1:8787/api/v1","sttFixture":"<this dir>/live.jsonl"}` (read only by unpackaged builds: `electron/copilot/e2e-hooks.ts`).
3. `node fake-openrouter.mjs 8787 $QA/server.log &`
4. `CL_COPILOT_E2E=$QA/e2e.json electron . --user-data-dir=$QA/profile --remote-debugging-port=9333 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --disable-features=AudioServiceSandbox`
5. `EV_DIR=<out> LAYOUT=panel MODE=live|practice node live.mjs` (Setup → consent → session → question → answer → stop → Sessions → scorecard), then `node controls.mjs` (Retry, panic, debrief link).

Speech is replayed by the fake STT adapter against the real mic frames' clock; answers and scores come from the fake OpenRouter server.
