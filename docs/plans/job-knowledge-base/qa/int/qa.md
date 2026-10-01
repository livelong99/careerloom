# KB-INT end-to-end QA (cloned profile, fakes, real `say`)

**What ran:** one Electron (unpackaged `dist/`, PID recorded by `scripts/kb-int-e2e/launch.sh`) on a **cloned** profile (`--user-data-dir` copy, keys removed, Singleton* removed) and a **copied** career-ops folder; the user's real data and installed app were never touched.
**Fakes:** search + web pages + research model = `CL_KB_E2E=1` fixtures (`electron/kb/research/e2e-hooks.ts`, unpackaged only); the answer/probe/rubric model = `scripts/kb-int-e2e/fake-openrouter.mjs` (via `CL_COPILOT_E2E`); mic = Chromium fake device + the STT fixture `answers.jsonl`.
**Real:** the app's IPC, store, pipeline, selector, runner, overlay, echo gate, playback queue and macOS `say` (en_IN Aman). Live spend: **$0**.
**Run it:** see `scripts/kb-int-e2e/README.md`. Frames/screenshots (dark + light) are the PNGs in this folder; `session-detail.json` is the stored session.

## Results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1.1 | KB tab shows the empty state with a research call-to-action | PASS | Overview / Job search / Jobs / Boards / Resume / Agents / Agent / Monitoring / Runs / Interview / Copilot / Settings / Help / v0.2.0 / Jobs  |
| 1.2 | First run asks for consent before anything is sent (dialog shown) | PASS | Overview / Job search / Jobs / Boards / Resume / Agents / Agent / Monitoring / Runs / Interview / Copilot / Settings / H |
| 1.2a | Before consent the research button is locked and a "Review and agree" notice shows | PASS |  |
| 1.3 | Nothing runs before consent (status none, no run) | PASS | none |
| 1.4 | Consent stored via interviewSetConfig (consentVersion set) | PASS | 2026-10-v1 |
| 1.5 | Fake research run finishes (progress seen while running) | PASS | complete items=17 sourced=65% sources=6 cost=$0.052 |
| 1.6 | Items appear, labelled sourced vs generated | PASS | 17 items: 11 sourced, 6 generated |
| 1.7 | Sourced items carry sources | PASS |  |
| 1.8 | KB tab lists the questions with provenance labels | PASS | Overview / Job search / Jobs / Boards / Resume / Agents / Agent / Monitoring / Runs / Interview / Copilot / Settings / Help / v0.2.0 / Jobs  |
| 1.9 | Runs page shows the research run (Job research, with the job) | PASS | Overview / Job search / Jobs / Boards / Resume / Agents / Agent / Monitoring / Runs / Interview / Copilot / Settings / Help / v0.2.0 / Runs  |
| 1.10 | Run record is mode job-research with jobId stamped, status done | PASS | [{"mode":"job-research","jobId":"https://www.google.com/about/careers/applications/jobs/results/121538506244661958-senior-software-engineer- |
| 2.1 | 'Practise this job' opens Practice with the AI interviewer for this job | PASS | 17 questions · 65% sourced |
| 2.2 | Plan preview comes from KB items and honours includeGenerated=false | PASS | {"all":{"questions":8,"sourced":7,"usd":0.04,"minutes":30},"sourcedOnly":{"questions":8,"sourced":8,"usd":0.04,"minutes":30}} |
| 2.3 | No playback before an explicit Start (nothing spoke while the form was open) | PASS | 0 kb-e2e log lines before Start, none added |
| 2.4 | AI interviewer asks KB questions and shows them in the overlay caption | PASS | ["Explain how closures capture variables in JavaScript and where that goes wrong in loops?","Tell me about a time you led a migration with u |
| 2.5 | Interviewer speaks with the system voice (real `say` process seen, en_IN voice first) | PASS | say -v Aman (English (India)) -r 175 --file-format=WAVE --data-format=LEI16@24000 -o /var/folders/sp/1qs8cbld3_x26yz_rx1z0y440000gn/T/cl-say |
| 2.6 | Playback events reach main (started/ended) and the gate engages | PASS | [kb-e2e] ttsPlayback started 4e575c78f74f73df35a1f97a32772cf1decbd3b6#2 / [kb-e2e] ttsPlayback ended 4e575c78f74f73df35a1f97a32772cf1decbd3b |
| 2.7 | Mic frames are dropped while speaking (half-duplex) and the overlay shows the "Mic paused" badge | PASS | drops logged=5 badge=true |
| 2.8 | Overlay goes listening after the question finishes speaking | PASS |  |
| 2.9 | Cues and suggestions come through the live path (auto question, hint, answer with SAY/bullets/STAR + fact flags) | PASS | {"questions":4,"suggestions":1,"firstTokenMs":257,"tier":"fast","flags":2} |
| 2.9a | Typed answer lands as the candidate line | PASS | I led the migration of forty services to Kubernetes and kept releases weekly by staging the cut-over per team. // I led the migration of for |
| 2.9b | Fake-mic (STT fixture) answer lands as a candidate line too | PASS | 2 candidate lines |
| 2.10 | Stop ends the voice (cancel) with no say process left | PASS | none |
| 2.11 | Session stores the interview record: per-question results with KB item ids from this KB | PASS | 2 results; ids in KB=2 |
| 2.12 | includeGenerated=false: every asked item is sourced | PASS | sourced,sourced |
| 2.13 | No repeats within the session | PASS | 3 asked |
| 2.14 | Debrief page lists the session with per-question rubric rows / heat map | PASS |  ⌘K / Interview Copilot / Practice with your own job and résumé, or get live help in a real interview. / Preview overlay / Start live sessio |
| 2.15 | KbItem.stats written back (asked, lastScore, avgScore) for the asked items | PASS | [{"id":"4e575c78f74f73df35a1f97a32772cf1decbd3b6","a":1,"last":3.6,"avg":3.6},{"id":"f6ae51ab88484c6418ca3711566495ad18715bbd","a":1,"last": |
| 2.16 | Skill signal written and readable over IPC (interviewSkillSignal) | PASS | {"jobId":"https://www.google.com/about/careers/applications/jobs/results/121538506244661958-senior-software-engineer-core?q=Senior+Software+ |
| 2.17 | Skill-up tab shows "From your practice sessions" from the signal | PASS | From your practice sessions / Average score per skill from the AI interviewer, weakest first. Skills below are ordered by it. / go · 3.6 of  |
| 3.1 | Settings > Interview prep page renders research, search, sources and voice groups | PASS | Interview prep / Monitoring / SYSTEM / Data & privacy / Advanced / Interview prep / Job research, search providers and t |
| 3.2 | Choosing Headphones in Settings is saved to interview.json | PASS | {"engine":"system","voiceId":null,"speed":1,"echo":"headphones","tailMs":350,"pushToInterrupt":"Control+Alt+I"} |
| 3.3 | Speed and budget are saved (validated, clamped) | PASS | {"speed":1.3,"budget":0.06} |
| 3.4 | Research budget from Settings applies to a run started in the KB tab (cost stays within $0.06) | PASS | {"status":"complete","cost":0.02} |
| 3.4a | A request above the hard ceiling is clamped (estimate high end <= $2) | PASS | {"usdLow":0.073,"usdHigh":0.328,"minutes":6,"backend":"brave","needsKey":false} |
| 3.5 | Practice form starts from Settings: speed 1.30x and Headphones selected | PASS | Speed / 1.30×  |
| 3.6 | Speed reaches the voice (say -r 228 = 175 wpm x 1.3) | PASS | say -v Aman (English (India)) -r 228 --file-format=WAVE --data-format=LEI16@24000 -o /var/ |
| 3.7 | Headphones: mic is not paused while the interviewer speaks (no dropped frames, no badge) | PASS | 1 log lines, dropped=0, badge=false |
| 3.8 | Switching the search provider clears consent (asks again) | PASS | null |
| 3.9 | KB tab asks again ("Review and agree") after the provider switch | PASS |  |

40/40 pass

## Needs a user run (not possible here: no real keys, no speakers test, no Kokoro install)

| Item | Why not run here | Exact steps |
|---|---|---|
| Real Brave search + real pages (S-R1) | no Brave key | Settings > API keys > Brave > Test. Open any evaluated job > Knowledge base > Research (agree once). Expect 40+ questions, ~60% sourced, cost under the shown cap, a run on the Runs page. For the yield table: `CL_LIVE_RESEARCH=1 BRAVE_API_KEY=... OPENROUTER_API_KEY=... node scripts/kb-research-dry.mjs --live --jobs jobs.json --max-usd 1` and fill `spikes/S-R1.md` |
| Real model practice (G-P) | no OpenRouter key | Settings > API keys > OpenRouter. Practice > AI interviewer > Start. Answer 3 questions by voice or typing. Expect real rubric scores in the debrief (cap $0.50); heat map + `KbItem` stats update |
| Kokoro voice | not installed (needs ~80 MB + Python wheels, Apple Silicon only) | Settings > Local models > Interviewer voice > Install (progress on Runs). Settings > Interview prep > Voice > Kokoro > Preview. Check first audio < 2.5 s and that a missing install falls back to the system voice with a notice in the overlay |
| OpenRouter voice | no key, model id `hexgrad/kokoro-82m` unverified | `CL_LIVE_TTS=1 node scripts/tts-latency.mjs --engine openrouter`; confirm the model id in OpenRouter's voice catalogue |
| Speaker echo (S-E1) | needs real speakers + mic in a quiet room | Speakers mode (default). Practice > Start. Stay silent while two questions play. Expect no interviewer text as a "You" line in the transcript and no spurious answer; then try Headphones and speak over the interviewer (barge-in cancels it) |
| Push-to-interrupt hotkey | not registered yet (config + gate exist) | see Gaps |
| Windows | KB, research and typed practice are expected to work; voice is untested | run the KB tab and a typed practice on a Windows build |

## Gaps found and fixed during integration
- Typed answers were dropped from the transcript whenever speech recognition was running (debrief would miss them): fixed + test.
- Settings > Interview prep voice defaults never reached the Practice form: fixed + test.
- The research cost estimate on an empty KB ignored the configured depth/budget: fixed.
- Job ids are URLs, so the store's id check rejected them while research used a hash folder: one `kbJobDir` for store, research cache and exports.

## Known gaps (not blocking)
- Push-to-interrupt accelerator is stored but not registered as a global shortcut.
- `recent` question ids across sessions are not fed to the selector (no repeats within a session only).
- `kbImport` has no file picker in the UI (IPC works).
- exa/serper key tests are not implemented (the search call itself is).
- Research LLM calls each show as their own `job-view` run on the Runs page next to the one `job-research` run.
