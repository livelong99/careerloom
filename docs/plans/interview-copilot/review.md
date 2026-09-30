# Interview Copilot: independent review (base `livelong99/copilot-int`, 299 files)

Scope: security/privacy, correctness (state machines, races, leaks), repo rules and notices. `electron/copilot/stt/**` and the Transcription page were read only (WP3b owns them). Verified by tests: `npm run typecheck && npm test` green (123 files, 1134 tests).

## Fixed in this branch (HIGH)

| # | Where | Finding | Fix + test |
|---|-------|---------|-----------|
| H1 | `electron/copilot/session.ts` start/stop/retry | **Kill switch lost during start.** `stop()` while `armed` (panic, Stop button, tray) published `stopped`, then the still-pending `openSources()` finished and `start()` published `listening`: overlay re-opened the mic, tray showed "listening", hotkeys re-registered, while main had already ended the session and dropped audio (adapters torn down). Adapters that finished starting after the stop (Moonshine sidecar) were never stopped. | Generation counter: `stop()` bumps it; `start`/`retry` check it after `openSources`, stop late adapters, and throw `Stopped while starting` (handlers already cleans up the recorder). Test `session.test.ts` "stop while arming". |
| H2 | `defaults.ts` `call` (debrief scoring) | **Transcript sent to an undisclosed provider, unredacted.** Scoring used `runText` = the user's agent CLI (Claude Code/Codex/Antigravity/OpenCode/Zen): full Q&A incl. the interviewer's words and the résumé went to that vendor (and its local session history, process argv), bypassing `privacy.redact`, the OpenRouter-only disclosure in the consent copy (plan §9) and local-only. It also re-ran on every open of an unscored session (1/min). | `privacy-calls.ts` `createScoreCall`: same configured provider as live answers, redaction applied when on. Removes the QA special case. Tests `privacy-calls.test.ts`. |
| H3 | `privacy.localOnly` | **Setting accepted but never enforced.** `copilotSetConfig` (or a hand edit) can set it; engine, classifier, practice follow-ups, model test/list still called OpenRouter (plan §9: "blocks all copilot network calls, enforced in main"). UI toggle is disabled, so it is reachable only via IPC/file, but the stored flag promised a guarantee it did not give. | `blockWhenLocalOnly` wraps the one provider factory (`live.ts`) + model list fetch; read per request. Tests `privacy-calls.test.ts`. |

## MEDIUM (not fixed)

| # | File:line | Finding | Suggested fix |
|---|-----------|---------|---------------|
| M1 | `store.ts:99-110` sweep | Retention strips `transcript` and question text only. `suggestions` (AI answers that can echo the question/transcript) and `scorecard` notes stay after retention 0 / expiry. `hasText`/`expiring` ignore them, so the confirm count is also low. | Clear `suggestions` (and note tips) in the sweep; include in `hasText`. |
| M2 | `overlay-host.ts:65-82` | Global hotkeys (⌃⌥A/F/C/S/M/E/L/H, ⌃⌥⇧H/X) are registered on first capture and only unregistered on panic. After a normal stop the overlay stays open and all combos stay claimed system-wide until quit. | Unregister on `stopped`; re-register on next `armed`. |
| M3 | `panic.ts:302` | `process.on('uncaughtException', …)` with no log/rethrow: installing the listener disables Electron's default crash handling for the whole main process (errors silently swallowed after a panic-stop). | Log the error and rethrow/`app.exit` after the stop, or use `process.on('uncaughtExceptionMonitor')`. |
| M4 | `engine.ts:81`, `defaults.ts:234`, `engine.ts:134` | `redactNames` is never wired (only emails/phones/self-intros masked), and the classifier call (`createLlmClassifier`) sends raw interviewer text, unredacted, while `privacy.redact` is on. `practice.complete` likewise. | Pass the redactor to the classifier and `complete`; wire the user/job company names. |
| M5 | `prompts.ts:193`, `context.ts:243-259` | The grounding prefix (job posting text: untrusted, scraped) goes into the **system** message without `neutralize()`; a posting with `[SAY]`/`<<<` can forge markers or inject instructions. Transcript and question are correctly fenced. | `neutralize` posting/report strings in `buildGrounding`. |
| M6 | `handlers.ts:144-183` | Live start does not call `assertSupported(true)` (`capabilities.ts`, currently dead): Apple-silicon-only is enforced in UI only. Consent is also appended before the duplicate-session check (`:176`), leaving an orphan consent record on a replayed id (within the 10 min window). | Call `assertSupported(mode==='live')`; check `store.get(sessionId)` before `appendConsent`. |
| M7 | `store.ts:48-56` | `rebuild()` calls `readSession` per `*.json` file name; a stray file whose name fails the id regex (`a.b.json`) makes `readSession` throw `Invalid session id` and `list()` fails for all sessions. | Skip non-matching names in `rebuild`. |
| M8 | `THIRD_PARTY_NOTICES.md` | No entry for the new pin `moonshine-voice==0.1.5` (MIT) or the Moonshine model weights (licence to be confirmed per model), and none for code ported from Open-Cluely (owner's project; header comments exist). | Add entries. |
| M9 | `stt/install.ts:114`, `sidecar-script.ts:15` | pip pin has no `--require-hashes`; `get_model_for_language` downloads at `serve` time when the chosen model is not cached (`sttInstalled` is not checked in `session.start`), i.e. a network call inside a session with a 60 s ready timeout. (stt/** read-only here.) | Hash-pin; fail fast when the model is not installed. |
| M10 | `build/entitlements.mac.plist` | `disable-library-validation`, `allow-unsigned-executable-memory` with `hardenedRuntime:false` are inert today but broad once notarization is on. | Re-evaluate at signing time. |

## LOW

- `mic.ts:13`: `new AudioContext` throwing leaks the `getUserMedia` stream tracks (wrap like `addModule`).
- `debrief.ts:55`: transcript inserted in `<transcript>` without stripping a closing tag; self-scoring only.
- `handlers.ts:291` `copilotTestLlmModel` has no rate limit (renderer-callable paid call).
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
