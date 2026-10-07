# Copilot cross-review, round 2

Scope: `git diff bdd872d..HEAD` over copilot/overlay/Settings code written by seven parallel QA agents. Method: read the interactions, probe with the simulator (`sim.test-util.ts`), failing test first. Two rounds; the second found nothing new. Tests: `cross-review.test.ts` (7 new), plus 1 in `guard.test.ts`, 1 in `stt/child.test.ts`. Typecheck clean, full suite 2308 pass.

## Bugs found and fixed
| # | Where | Bug | Fix |
|---|-------|-----|-----|
| 1 | `live-wiring.ts` detect (merge) | `auto.unask()` ran on every merge. If the fragment was never asked (rate gap, incomplete), it popped the slot of an earlier answer still streaming, so the merged question bypassed the 2.5 s gap and aborted that answer | `tail.asked` set in `startAuto`; unask only when the fragment was asked |
| 2 | `live-wiring.ts` `undefer` | The rate-limit branch called `undefer()`, which bumps `gen`. A later line whose classify was still in flight was silently dropped (a lost question) | split: `unschedule()` (timer only) for the deferral, `undefer()` (gen++) only for reset/Clear/stop/panic |
| 3 | `overlay-host.ts` `onHotkey` | The held-key guard covered answer actions only. A held `quickHide`/`toggle`/`expand` auto-repeats on Windows and flipped back, un-hiding a quick-hidden overlay | guard every action except `panic` |
| 4 | `guard.ts` `draftLines` | The coding-format slot puts a fenced code block in `[SAY]`; the case-insensitive PERSONAL regex matched the loop variable `i`, so code comments produced false "unsupported number" flags | strip fenced code (also an unterminated fence) before claim detection |
| 5 | `stt/child.ts` | New stderr logging had no cap: a library warning per frame grows the daily log without bound | 200 lines per process, then one "further stderr lines not logged" line |

Existing `overlay-host.test.ts` tests pressed the same key twice in one millisecond; they now advance a fake clock.

## Checked, no bug
- Hedge (`withHedge` + `withFailover` + `requireFormat`): loser aborted, winner is the first with `[SAY]` (format-valid), failed primary goes to the next model with no wait, panic mid-hedge aborts both requests with no error and no retry (new test). Marks are set-once.
- Dedupe vs press, Clear, failed/empty asks; config normalise is idempotent for both platform defaults and all default accelerators pass the new reserved list; `child.ts` engine name works for `venv/Scripts/python.exe`; debug-log masking (sk-/Bearer/keys) applies to the raw-reply log, replies capped at 1500 chars and the line at 6000.

## Unresolved / judgement calls
- Cost: the session ceiling counts only the winner's tokens; an aborted hedge loser is billed by the provider but not counted. The hedge fires after 4 s without a usable first token, so slow reasoning models hedge on every turn. `hedgeAfterMs` has no setting (engine default only).
- A fragment ending mid-phrase ("…work across") is auto-asked at once, then restarted when the continuation merges: one wasted request, never a delayed answer.
- An unpunctuated cut followed by a non-question ("okay") merges into the question text.
- The replies in the debug log can contain résumé facts (user-chosen folder).

## Real Electron smoke (cloned profile, electron lock taken and released)
Fake OpenRouter + fake STT fixture with a question split in two finals 0.7 s apart ("Tell me about a time you led a" / "migration under pressure?"). Result: 3 transcript lines, **1 question, 1 answer request, 1 suggestion**, question visible at 5.3 s, answer complete 2.2 s after the click, session scored 3.6, stop and Sessions scorecard fine. Screenshots: `cross-review-shots/` (question banner, mid-stream answer, finished answer). Not driven for real: global hotkeys, Windows, auto-ask (mic-only session has no interviewer channel).
