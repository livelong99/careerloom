# KB integration QA (cloned profile, no key, no spend)

Dev-only. Never point this at the real profile, career-ops folder or installed app.

1. `QA=<scratch>`; clone: `/bin/cp -cR ~/Library/Application\ Support/careerloom $QA/profile` and `/bin/cp -cR <career-ops> $QA/career-ops`; delete `Singleton*`, `DevToolsActivePort`, `*.key`, `kb/` from the profile; set `root` in `$QA/profile/settings.json` to the copy.
2. `$QA/e2e.json`: `{"baseUrl":"http://127.0.0.1:8788/api/v1","sttFixture":"<repo>/scripts/kb-int-e2e/answers.jsonl"}`.
3. `node fake-openrouter.mjs 8788 $QA/server.log &` (record the PID; kill it by PID).
4. `npm run build`, then `QA=$QA ELECTRON=<an Electron binary> scripts/kb-int-e2e/launch.sh` (starts ONE Electron with `CL_KB_E2E=1` + `CL_COPILOT_E2E`, PID in `$QA/app.pid`; stop it with `kill $(cat $QA/app.pid)`, never by name).
5. `CDP_PORT=9341 QA=$QA node qa1-research.mjs; ... qa2-practice.mjs; ... qa3-settings.mjs` (each records PASS/FAIL into `docs/plans/job-knowledge-base/qa/int/results.json` and writes dark/light PNGs); `node qa-md.mjs` prints the table.

Real `say` speaks during qa2/qa3 (a few seconds). Fake search/pages/model come from `electron/kb/research/fixtures` through `e2e-hooks.ts` (ignored by packaged builds).
