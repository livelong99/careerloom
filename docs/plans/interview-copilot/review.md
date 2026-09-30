# Interview Copilot: independent review (base `livelong99/copilot-int`, 299 files)

Scope: security/privacy, correctness (state machines, races, leaks), repo rules and notices. `electron/copilot/stt/**` and the Transcription page were read only (WP3b owns them). Verified by tests: `npm run typecheck && npm test && npm run build` green after the fixes.

## Fixed in this branch (HIGH)

| # | Where | Finding | Fix + test |
|---|-------|---------|-----------|
| H1 | `electron/copilot/session.ts` start/stop/retry | **Kill switch lost during start.** `stop()` while `armed` (panic, Stop button, tray) published `stopped`, then the still-pending `openSources()` finished and `start()` published `listening`: overlay re-opened the mic, tray showed "listening", hotkeys re-registered, while main had already ended the session and dropped audio (adapters torn down). Adapters that finished starting after the stop (Moonshine sidecar) were never stopped. | Generation counter: `stop()` bumps it; `start`/`retry` check it after `openSources`, stop late adapters, and throw `Stopped while starting` (handlers already cleans up the recorder). Test `session.test.ts` "stop while arming". |
| H2 | `defaults.ts` `call` (debrief scoring) | **Transcript sent to an undisclosed provider, unredacted.** Scoring used `runText` = the user's agent CLI (Claude Code/Codex/Antigravity/OpenCode/Zen): full Q&A incl. the interviewer's words and the résumé went to that vendor (and its local session history, process argv), bypassing `privacy.redact`, the OpenRouter-only disclosure in the consent copy (plan §9) and local-only. It also re-ran on every open of an unscored session (1/min). | `privacy-calls.ts` `createScoreCall`: same configured provider as live answers, redaction applied when on. Removes the QA special case. Tests `privacy-calls.test.ts`. |
| H3 | `privacy.localOnly` | **Setting accepted but never enforced.** `copilotSetConfig` (or a hand edit) can set it; engine, classifier, practice follow-ups, model test/list still called OpenRouter (plan §9: "blocks all copilot network calls, enforced in main"). UI toggle is disabled, so it is reachable only via IPC/file, but the stored flag promised a guarantee it did not give. | `blockWhenLocalOnly` wraps the one provider factory (`live.ts`) + model list fetch; read per request. Tests `privacy-calls.test.ts`. |

## MEDIUM

Fixed (tests first, lead-approved): M1-M8.

| # | Finding | Status / fix |
|---|---------|--------------|
| M1 | `store.ts` sweep cleared transcript and question text only: generated answers (`suggestions`) and debrief tips (`scorecard.notes`) survived retention 0 / expiry, and `hasText`/`expiring` ignored them. | **Fixed.** Sweep blanks answer text (keeps model/cost/scores), empties notes; `hasText` counts them so the confirm count is right. |
| M2 | `overlay-host.ts` global hotkeys stayed registered after a normal stop (overlay stays open on the stopped card) and a config change re-claimed them. | **Fixed.** `unregisterAll` on any non-capturing state; re-register only while armed/listening. |
| M3 | `panic.ts` `process.on('uncaughtException')` disabled Electron's default crash handling app-wide. | **Fixed.** Uses `uncaughtExceptionMonitor` (observes, never swallows): capture stops first, Electron's crash dialog/exit still happens. |
| M4 | Classifier and practice follow-up calls sent unredacted text; `redactNames` never wired. | **Fixed.** `redactIfOn` masks classify/complete/scoring per call; the candidate's name from the top of cv.md is masked via `redactNames` (interviewer names are still unknown: regex intro/title masking only). |
| M5 | Job-posting/report text went into the system prompt unfenced. | **Fixed.** `neutralize()` on posting, evaluation and stories in the grounding prefix (cv.md stays verbatim so proof quotes still match). |
| M6 | No server-side Apple-silicon check for live; consent appended before the duplicate-session check. | **Fixed.** `assertSupported(live)` in `copilotStart`; duplicate id refused before any consent record. |
| M7 | A stray `*.json` in `sessions/` made `list()` throw for everyone. | **Fixed.** `rebuild()` skips non-id file names. |
| M8 | `THIRD_PARTY_NOTICES.md` lacked moonshine-voice, Moonshine models, Whisper alternates and the Open-Cluely port. | **Fixed.** Entries added; Whisper engines are listed as "not installed yet". Re-check each Moonshine model card at release. |
| M9 | `stt/install.ts:114` installs `moonshine-voice==0.1.5` without hashes; `sidecar-script.ts:15` `get_model_for_language` downloads at `serve` time if the chosen model is not cached (`session.start` does not check `sttInstalled`). | **Follow-up (WP3b owns stt/\*\*).** Recipe: (1) generate `requirements-stt.txt` with `pip-compile --generate-hashes` for moonshine-voice 0.1.5 and its wheels, install with `pip install --require-hashes -r`; (2) record the model file SHA-256 after the `fetch` step in `ready.json` and verify in `findSttRuntime`; (3) in `defaults.ts` `session.start`, throw before `ctl.start` when `!sttReady()` and run the sidecar with `HF_HUB_OFFLINE=1` so a session can never download. |
| M10 | `build/entitlements.mac.plist` has `disable-library-validation` and `allow-unsigned-executable-memory` (inert while `hardenedRuntime:false`). | **Follow-up at signing time.** Recipe: turn on `hardenedRuntime`, start with only `allow-jit` + `device.audio-input`, add `allow-unsigned-executable-memory` only if the notarized build crashes without it, and drop `disable-library-validation` unless the sidecar's native wheels fail to load (then sign them with the same team id instead). |

## LOW

- `mic.ts:13`: `new AudioContext` throwing leaks the `getUserMedia` stream tracks (wrap like `addModule`).
- `debrief.ts:55`: transcript inserted in `<transcript>` without stripping a closing tag; self-scoring only.
- `handlers.ts` `copilotTestLlmModel` has no rate limit (renderer-callable paid call).
- Dead code: `assertSupported`/`liveSupported`/`capabilities()`, `answerGuard`/`AnswerGuard`/`PromptBuilder` interfaces, `systemAudioStatus`/`settingsUrl` (duplicated by `PANE` in `defaults.ts`).
- Score prompt redaction masks date ranges in the résumé excerpt (PHONE regex, ≥7 digits); harmless for scoring.
- `CONSENT_TEXT_VERSION` is `…draft1` (gate G-D pending, known).

## Checked and OK

- Keys: only via `readApiKey`/`safeStorage`; errors scrubbed (`LlmError`), no key/Authorization logged; `ApiKeyRow` never reads the key back; E2E hooks inert when packaged.
- IPC: every `copilot*` handler validates its input (ids `^[\w-]{1,80}$`, enums, bounds, overlay cmd whitelist); `copilotAckPrivacyNotice` is the only way to record the notice (`withoutNoticeAck`); platform gate on every call.
- Consent: re-validated in main (both checkboxes, text version, age ≤10 min, skew, mic required); indicator/provider/retention stored server-side, not from the renderer.
- Retention/deletion: paths built only from regex-checked ids; notes file name is a hash of the job id; no path traversal found.
- Run logs: copilot runs are not in `TAIL_MODES`; `runs.jsonl` holds `input: null`; no transcript/answer text is logged (console only logs `err.message`).
- Answer engine: transcript/question fenced and neutralized; proof quotes checked verbatim; factCheck flags, never silently edits; cost ceiling per session.
- Overlay window: `sandbox`, `contextIsolation`, no node integration, no `webSecurity:false`, navigation/window-open denied, strict CSP, `focusable:false`, no masquerade (`no-masquerade.test.ts` intent holds: no `process.title`/app id/name calls in `electron/**`).
- Privacy mode list (plan §11 WP1 1-8): flags only via `privacy-mode.ts`, ack-gated, restored on stop/panic/before-quit/crash; constant titles; indicator honoured only in Privacy mode; tray independent.
- Resources: mic tracks released on stop/unmount/late-resolve; sidecars killed on stop and `before-quit`; heartbeat timer `unref`'d; panic idempotent until a new session.
