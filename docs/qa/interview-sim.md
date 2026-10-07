# Interview simulation QA (live-wiring → detector → auto-ask → engine → guard → overlay events)

Simulator: `electron/copilot/sim.test-util.ts` (scripted fake OpenRouter streaming real SSE bytes through the real provider; real detector, auto-ask, engine, guard, live wiring; fake clock). Tests: `interview-sim.test.ts` (5 interviews) and `sim-faults.test.ts` (faults, dedupe, merge, parser, log, latency). 33 new tests. Full suite 2189 pass, typecheck clean. Only fakes were used: no Electron, no model, no OpenRouter key.

## Interviews
1. Behavioural: small talk ignored, 20 s silence spends nothing, follow-up answered, [PROOF] only here and only verbatim.
2. Coding: question cut by the STT chunker, inline `[SAY] text`, a leaked [PROOF] dropped.
3. System design: long multi-part question, slow first token, deep tier, streamed.
4. Data engineering: empty then malformed reply fail over; 429 then a reasoning leak before `[SAY]`.
5. Panel: STT re-emit, impatient hotkey presses, interruption mid-answer, clarification inside the auto-ask gap, Clear/panic mid-answer.

## Issues found and fixed
| # | Issue | Fix |
|---|---|---|
| 1 | Hotkey presses (or a press during an auto answer) aborted and restarted a good in-flight answer (3 requests for 1 question) | `live-wiring.ts` same-question dedupe: 15 s window, never while still streaming, not after a failed/empty ask, press for the screenshot is exempt, Clear resets |
| 2 | Parser ignored `[SAY] text` on one line (say empty) | `prompts.ts` MARKER accepts inline text; `engine.ts` SAY_VISIBLE too |
| 3 | Malformed SSE chunk (`stream` error) was not retried, so no failover | `providers/openrouter.ts` `stream` is retryable (failover only retries before output) |
| 4 | Question cut in two by STT answered as a fragment, then a second answer | `detector.ts` `continuesQuestion` + `live-wiring.ts`: joined under the first question's id (one overlay/session entry), previous request aborted, auto-ask slot refunded (`auto-ask.ts unask`). Never joins a fresh unpunctuated question |
| 5 | Clarification inside the 2.5 s auto-ask gap was shown as the question but never answered | deferred ask when the gap clears (`auto.gapMs`), cancelled by Clear, panic, stop; a detection already awaiting the detector when Clear hits is dropped (`gen`) |
| 6 | Models adding [PROOF] to non-behavioural answers; `<think>` blocks and reasoning lines ("Okay, so the user…", "Wait, let me reconsider") reached the overlay; text after a blank line was glued onto the last bullet | `engine.ts onlyBehaviouralProof`, `prompts.ts` THINK strip, narrow LEAK_LINE, blank line ends a wrapped bullet |
| 7 | Raw model reply not in the debug log | `engine.ts` logs `reply` and `bad reply` with the raw text clipped to 1500 chars |
| 8 | Nothing covered a model that connects but never sends a token (15 s first-byte timeout) | `failover.ts withHedge`: after 4 s with no usable first token start the next model, first to yield wins, loser aborted (`hedgeAfterMs`, 0 = off) |
| 9 | Failover waited 250/500 ms before trying a *different* model after an empty/failed reply | `failover.ts`: back off only for rate_limit or when retrying the same endpoint |

## Latency (virtual clock; profiles are assumptions: fast-tier TTFT 700 ms; not real model speed)
| Scenario (end of speech → first visible line) | Before | After |
|---|---|---|
| Clean turn (detect 0, connect 700, firstSay 700, total 860) | 700 ms | 700 ms |
| First model returns empty (300 ms), second answers | 1250 ms | 1000 ms |
| Primary connects but never answers | 15 950 ms | 4 700 ms |

Slowest controllable stage was the retry/stall path (back-off and the first-byte timeout). On the clean path everything the app controls is ≈0 and the time is the model's first token; streaming to done adds ≈160 ms.

## Unresolved / notes
- No real-model or real-STT run (shared 16 GB machine, no key used). Merge thresholds (4 s, 1.5 s) and the 4 s hedge are untuned guesses; hedging doubles request cost on the rare stalled turns (the loser is aborted and unmetered).
- A cut-off question is still answered once as a fragment if the continuation arrives after the first answer started; it is then replaced under the same id (one wasted request). A hold-and-wait would cost latency on every unpunctuated final.
- Headline ≤15 words / bullets ≤12 words are prompt-enforced only; the tests check scripted compliant replies, nothing truncates a model that ignores the limit.
- Dedupe means a deliberate "regenerate" press on the same question within 15 s is ignored (follow-up/clarify/screenshot still work).
- `orca orchestration send` failed to run in this sandbox ("Unable to determine Orca.app path") — see the final message.

Files outside the listed scope: `providers/openrouter.ts` (one line, #3), `failover.test.ts` (back-off assertion updated for #9).
