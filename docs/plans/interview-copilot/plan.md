# Interview Copilot — Implementation Plan (Phase 3)

Inputs: `research.md` (facts, sources), `design.md` + `prototype/` (screens). Defaults below are **provisional** (lead-approved at G1, user to confirm) and are isolated in §15 so they are cheap to change.
Target: Careerloom v0.3.0 · **macOS (Apple Silicon) for Live; Windows = Practice only** · Electron ^43.7.0 (installed version unverified in this worktree).

## 1. Context and scope

Add a **Copilot** section (config workspace, 10 pages) and an **overlay window** that listens (mic, later system audio), detects interviewer questions, and streams grounded suggestions built from the job posting, evaluation report, `cv.md` facts and STAR stories.

**User decisions (2026-10-01, supersede earlier provisional defaults):** STT = **Whisper on MLX** (local, on-device); LLM = **OpenRouter**; **answer-on-demand** is the default; **Windows gets Practice mode only**; transcript retention default **3 months**, changeable in the app.
**MVP (M1):** Practice mode (macOS + Windows) + mic-only Live (macOS Apple Silicon) + local Whisper MLX STT + OpenRouter streaming runner + consent gate + kill switch. **M2:** system audio (macOS, after spike gate). **M3:** screenshot → vision. **M4:** local LLM, Windows Live (new STT adapter), extras.
**Included as opt-in, OFF by default — Privacy mode** (user decision): hide overlay from screen sharing (`setContentProtection`), no Dock icon while listening, neutral window title, click-through, quick-hide hotkey, configurable recording indicator. Guarded by a one-time plain notice (some interviewers/employers prohibit AI help; hide-from-capture unreliable on macOS 15+ ScreenCaptureKit). Per-session consent is **not** part of it.
**Not included:** process-name masquerading, fake system-app/browser identities, disguised installers/icons, near-invisible opacity or cursor tricks, or anything aimed at defeating proctoring/anti-cheat software. Also out: the unauthenticated LAN companion, diarisation, auto-typing into other apps, raw-audio retention (design.md §7).
**Reuse:** Open-Cluely is the user's own project, so code/prompts are **ported** (TS/React adaptation, keys via `safeStorage`). Per-package port map in §11.

## 2. Dependencies on other branches

| Needs | From | Status | Fallback |
|---|---|---|---|
| `parseReport(md): ReportView` incl. `sections[kind==='interview']`, `personalization`, `gaps`, `topStrengths` | `feat-job-page` `electron/job-view/reportParse.ts` | being merged to integration | heading splitter `^## [A-Z]\)` (≤ 40 lines) behind the same `InterviewPlan` type |
| `JobPosting` (requirements, skills, techStack, summary) | `electron/job-view/jdStructure.ts` (`cachedPosting`, `deterministicPosting`) | same | use `JobListing` + raw report markdown |
| `readCv()`, `currentProfile()`, `factCheck()` | this branch (`resume-agent.ts`, `ats/factCheck.ts`) | present | — |
| Resume/Job page hooks for "Add to résumé bullets / job notes" | Resume rework (merged), Job page | present / merging | write to `ats` answers store and job note file only |

WP0 must not start before `job-view` is on the integration branch or the fallback splitter is chosen at gate **G-A**.

## 3. Architecture

```
Overlay renderer ←─ IPC push (careerloom:copilot*) ─┐          Config renderer (Section 'copilot')
   ▲ hotkeys/tray → main                             │                 ▲ invoke careerloom:copilot*
   │                                                 │                 │
┌──┴─────────────── electron/copilot/ (main process) ┴─────────────────┴──────────────┐
│ session.ts  state machine: idle→armed→live→stopped; owns capture/STT/engine lifetimes │
│ overlay-window.ts  BrowserWindow(s), level, click-through, bounds, panic                │
│ hotkeys.ts  globalShortcut register/verify/unregister; tray.ts  Stop now              │
│ stt/ adapter interface + whisper-mlx.ts (Python sidecar, chunked) + fake.ts          │
│ detector.ts  endpointing + rules + optional tiny LLM classify                         │
│ context.ts  builds cached grounding prefix (posting+report+cv facts+stories)          │
│ engine.ts   streaming runner (SSE fetch, abort, retry), prompt templates, cost meter  │
│ guard.ts    factCheck() on finished answer; redaction before send                     │
│ store.ts    sessions, consent records, retention sweep                                 │
└───────────────────────────────────────────────────────────────────────────────────────┘
 Audio capture runs in a hidden/overlay renderer (getUserMedia + AudioWorklet → PCM16 chunks → IPC to main).
 All network (STT + LLM) is in main; renderers keep `connect-src 'self'`.
```

Reused: `broadcast`, `readSecret/writeSecret`, `zenError`/`ZEN_URL`/`zenModel`, FEATURES registration, `userFile()`, `factCheck`, `readCv`, job-view parsers, prescreen-model install pattern (local STT model), `killSidecars`-style cleanup on quit.
New pattern: long-lived child process (only for M4 on-device STT helper); SSE streaming (M1).

### 3.1 Capture (WP3)
- Mic: `getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})` → `AudioContext({sampleRate:16000})` → AudioWorklet posts Int16 frames (80–100 ms) to main (`copilotAudioChunk`, transferable). Worklet file under `renderer/copilot/worklet.js`, allowed by `script-src 'self'`.
- **Platform rule:** Live capture exists on macOS only (Apple Silicon, because MLX). On Windows `copilotStart(mode:'live')` is refused in main (`process.platform` check) and the UI disables "Start live session" with an explanation; no capture/STT code path is reachable on Windows in M1. Windows Practice answers are typed (no STT); voice practice on Windows needs a new STT adapter (M4).
- System audio (M2, macOS): main sets `session.setDisplayMediaRequestHandler` with `audio:'loopback'`; renderer calls `getDisplayMedia`. **Spike gate G-B** decides between: (a) macOS ≥14.2 CoreAudio tap (`NSAudioCaptureUsageDescription`), (b) `useSystemPicker:true` path (issue #52738 workaround), (c) virtual device (BlackHole) via `getUserMedia`, (d) mic-only.
- Health: per-source "samples received in last 3 s" detector drives the **permission-missing** overlay state (silent ended track raises no error).
- Channel = speaker (`interviewer` = system, `you` = mic). No diarisation.

### 3.2 STT adapter (WP3)
Interface in §6. **MVP adapter: Whisper on MLX** (`whisper-mlx.ts`), fully on-device: audio never leaves the Mac, only text goes to OpenRouter.
- **Runtime:** `mlx-whisper` (Python, `pip install mlx-whisper`; MIT licence per the repo's licence file; `transcribe()` on a file or array, optional `word_timestamps`; default model `mlx-community/whisper-tiny`, pre-converted models on the Hugging Face MLX Community — README: https://raw.githubusercontent.com/ml-explore/mlx-examples/main/whisper/README.md). **The README documents no streaming/real-time API**, so we build pseudo-streaming ourselves (below). Apple Silicon requirement is inferred from MLX, not stated on that page — verify.
- **Sidecar:** a **long-lived** Python process (new pattern: `fit-sidecar.ts` is one-shot) spawned at session start, JSON-lines over stdin/stdout (audio as length-prefixed PCM16 frames on stdin), tracked and killed on stop/quit/crash (`killSidecars` pattern). One model instance serves both channels sequentially (16 GB rule: one heavy model at a time; `assertMemory()`-style check before start).
- **Install:** optional-install flow like `prescreen-model.ts` into `~/.careerloom/stt/` (venv + pinned model revision + selftest), started from the Transcription page and from the Live gate if missing. Nothing ML ships in the installer. Model choice (tiny/small/turbo-class), size and RAM are **unverified**: decided in spike S2.
- **Chunking:** energy/VAD gate cuts utterances; a growing window is re-decoded about every 1 s for `partial`, `final` on silence ≥ `endSilenceMs` (700–900 ms) with overlap trimming; `stt/merge.ts` (port) joins adjacent finals per source. Expected partial latency ~1–2 s and final ≈ silence + decode (hypothesis; measured at gate G-C).
- **Failure:** sidecar crash → restart once, replay ≤ 10 s ring buffer, else `copilotError{kind:'stt'}` and the overlay error state. Cloud adapters (Soniox/AssemblyAI/Deepgram) stay behind the same interface but are **not in M1**.

### 3.3 Question detector (WP2)
1. Interviewer-channel final/EOT text only. 2. Rules: trailing `?`, openers (what/why/how/tell me/walk me through/describe/explain/design/implement/write/given), "can you…". 3. Ambiguous → one tiny classify call (`max_tokens≈5`) → `{isQuestion, type}`. 4. Optional eager start on provider early-EOT, `AbortController` cancel if speech resumes. Output `DetectedQuestion {id,text,type,confidence,at}`. Types: `behavioural|technical|system-design|coding|other`.

### 3.4 Context + answer engine (WP2)
- **Grounding prefix** (stable, cacheable): system rules + persona + `JobPosting` summary/requirements + `ReportView` strengths/gaps/personalization + **Interview Plan** STAR stories + `cv.md` facts (structured list) — target ≥ 4,096 tokens only if the chosen model caches (Haiku-class threshold per Anthropic docs); otherwise keep it lean. Then rolling transcript window (last ~6 turns) + the question.
- **Streaming runner:** `fetch` with `stream:true`, SSE parser (OpenAI-compatible `data:` chunks; adapter for messages-API events), `AbortController` per request, first-token timestamp, usage/cost from response or estimate. **Provider: OpenRouter** (`providers/openrouter.ts`), the only provider in M1 (the `AnswerProvider` interface keeps Zen/direct-API possible later). Reuse `readApiKey()` (existing `openrouter` secret in `safeStorage`). OpenRouter facts (docs read 2026-10-01: https://openrouter.ai/docs/api-reference/streaming, https://openrouter.ai/docs/features/provider-routing): `stream:true` returns SSE `data:` chunks; the stream may contain comment lines such as `: OPENROUTER PROCESSING` that **must be skipped before JSON parsing**; mid-stream errors arrive as an SSE event with a top-level `error` and `finish_reason:'error'` (HTTP stays 200); a final usage chunk precedes `[DONE]`; cancel with `AbortController` (only some providers stop processing/billing). Routing body options used: `provider.data_collection:'deny'` (default in Careerloom), optional `provider.zdr:true`, `provider.sort:'latency'`, `allow_fallbacks` default. No tool loop, no agent CLIs.
- **Shapes:** `cues | cues+star | script` (coaching page). Output schema is text with section markers parsed incrementally → `say`, `bullets[]`, `star{S,T,A,R}`, `proof[]` (each `{quote, source}` must be a substring of `cv.md` or a story, else dropped).
- **Guard:** after stream ends `factCheck(cv, cv+draft)`; violations → inline "check this number" chip, never silent removal of text the user is already reading. Redaction (names/emails) applied to transcript text before send if enabled.
- **Escalation:** `system-design|coding` → Deep tier when enabled.
- **Cost meter:** per request tokens × configured price table (editable JSON, dated) → overlay `lat` + `cost`.

### 3.5 Privacy mode (WP1; opt-in, OFF by default)
`electron/copilot/privacy-mode.ts` owns every low-profile flag so it is one reviewable file: `applyPrivacyMode(win, cfg, live)` sets `setContentProtection`, `app.dock.hide()/show()` for the live session only, fixed neutral title (`"Careerloom"`), idle click-through, and the indicator variant. Options are honoured only when `privacy.mode.enabled && noticeVersion === CURRENT_NOTICE`; otherwise main ignores them (the renderer cannot bypass). Quick hide (`⌃⌥⇧H`): hide overlay + tell renderer to wipe on-screen text; capture continues; second press restores. The tray/menu-bar icon always reflects capture state and keeps "Stop now" regardless of the indicator setting. A vitest guard (`no-masquerade.test.ts`) greps `electron/**` for `process.title`, `setAppUserModelId`, `app.setName(` and fails if any appear, so disguise features cannot slip in from a port.

## 4. IPC contract (TypeScript)

New file `electron/copilot/types.ts`, re-exported from `electron/contract.ts` by one line (WP0). Handlers register via a new `copilotHandlers` entry in `FEATURES` (`main.ts:112`); push events via `broadcast`.

```ts
export type CopilotMode = 'practice' | 'live'
export type Speaker = 'interviewer' | 'you'
export type QuestionType = 'behavioural' | 'technical' | 'system-design' | 'coding' | 'other'
export type CopilotState = 'idle' | 'armed' | 'listening' | 'stopped'
export type OverlayViewState = 'idle' | 'listening' | 'question' | 'answering' | 'answered' | 'permission' | 'error' | 'stopped'
export type SourceId = 'mic' | 'system'

export type TranscriptLine = { id: string; speaker: Speaker; text: string; final: boolean; t0: number; t1: number | null }
export type DetectedQuestion = { id: string; text: string; type: QuestionType; confidence: number; at: number; auto: boolean }
export type Suggestion = {
  questionId: string; model: string; tier: 'fast' | 'balanced' | 'deep'
  say: string; bullets: string[]; star: { s: string; t: string; a: string; r: string } | null
  proof: Array<{ quote: string; source: string }>; flags: Array<{ kind: 'unsupported-number' | 'unsupported-skill' | 'unsupported-name'; text: string }>
  done: boolean; firstTokenMs: number | null; totalMs: number | null; costUsd: number | null
}
export type SourceHealth = { source: SourceId; status: 'ok' | 'silent' | 'denied' | 'missing'; level: number }

export type ConsentRecord = {
  id: string; sessionId: string; at: number; textVersion: string
  aiAllowedConfirmed: boolean; everyoneInformedConfirmed: boolean; jurisdiction: string | null
  sources: SourceId[]; sttProvider: string | null; llmProvider: string | null; transcriptSaved: boolean
  privacyMode: boolean; indicator: 'chip' | 'dot' | 'off'
}
export type SessionSummary = { id: string; startedAt: number; endedAt: number | null; mode: CopilotMode; jobId: string | null; questions: number; durationSec: number; score: number | null }
export type SessionDetail = SessionSummary & { transcript: TranscriptLine[]; questionsList: DetectedQuestion[]; suggestions: Suggestion[]; scorecard: Scorecard | null }
export type Scorecard = { structure: number; specifics: number; evidence: number; concision: number; notes: Array<{ questionId: string; tip: string; suggestedLine: string | null }> }

export type StartRequest = { mode: CopilotMode; jobId: string | null; interviewType: InterviewType; consent: ConsentRecord | null /* required for live */ }
export type InterviewType = 'recruiter' | 'behavioural' | 'technical' | 'system-design' | 'mixed'

// Renderer → main (invoke `careerloom:<name>`)
export interface CopilotApi {
  copilotGetConfig(): CopilotConfig
  copilotSetConfig(patch: DeepPartial<CopilotConfig>): CopilotConfig
  copilotReadiness(jobId: string | null): { context: ContextSummary; mic: PermStatus; system: PermStatus; stt: 'ready' | 'no-key'; engine: 'ready' | 'no-key' }
  copilotContextPreview(jobId: string | null): { tokens: number; posting: number; strengths: number; gaps: number; facts: number; stories: number; text: string }
  copilotProbeAudio(source: SourceId, ms: number): SourceHealth           // "Test for 3 seconds"
  copilotOpenSystemSettings(pane: 'microphone' | 'system-audio' | 'screen'): boolean
  copilotStart(req: StartRequest): { sessionId: string }                  // rejects live without valid ConsentRecord
  copilotStop(reason: 'user' | 'panic' | 'error'): void                   // idempotent, capture off first
  copilotAnswer(kind: 'answer' | 'followup' | 'clarify' | 'summarise', questionId?: string): void
  copilotScreenshot(): void                                               // M3
  copilotOverlay(cmd: { collapse?: boolean; hide?: boolean; quickHide?: boolean; passive?: boolean; moveTo?: Anchor }): void
  copilotAckPrivacyNotice(version: string): { ok: boolean }                // stores the ack; Privacy mode flags apply only after it
  copilotListSessions(): SessionSummary[]
  copilotGetSession(id: string): SessionDetail | null
  copilotDeleteSession(id: string | 'all'): number
  copilotExportConsents(): string                                         // JSON file path
  copilotPracticeQuestions(jobId: string | null): Array<{ id: string; text: string; type: QuestionType; source: 'report' | 'custom'; lastScore: number | null }>
  copilotCheckHotkey(accel: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' }
  copilotApplyDebrief(sessionId: string, questionId: string, action: 'resume-bullet' | 'job-note'): { ok: boolean }
}
export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'c' | 'mr' | 'bl' | 'bc' | 'br'

// Renderer → main, high-rate (ipcRenderer.send, not invoke)
export type AudioChunkMsg = { source: SourceId; pcm16: ArrayBuffer; t: number }   // channel 'careerloom:copilotAudio'

// Main → renderer (broadcast; overlay + config subscribe)
export type CopilotEvents = {
  copilotState: { state: CopilotState; mode: CopilotMode; sessionId: string | null; sources: SourceId[]; startedAt: number | null }
  copilotTranscript: TranscriptLine
  copilotQuestion: DetectedQuestion
  copilotSuggestion: Suggestion                 // repeated, `done:false` while streaming; throttle ≤ 12/s
  copilotHealth: SourceHealth
  copilotError: { kind: 'stt' | 'engine' | 'capture' | 'hotkey'; message: string; retrying: boolean; attempt?: number }
  copilotLevel: { source: SourceId; level: number }     // 0..1, ≤ 15/s
}
```

Validation: every handler validates input with the existing `str()` style guards; `copilotStart(live)` re-checks the consent record server-side (two confirmations true, `textVersion` current, ≤ 10 min old).

## 5. Data model and storage

| What | Where | Notes |
|---|---|---|
| Config | `userData/copilot.json` | separate from `settings.json` (no shared-file contention); schema §7 |
| Keys | `userData/stt-<provider>.key`, `llm-<provider>.key` via `safeStorage` (`writeSecret`) | renderer sees only `hasKey` booleans |
| Sessions | `userData/copilot/sessions/<id>.json` (0600) | transcript, questions, suggestions, scorecard; pruned per retention |
| Consent records | `userData/copilot/consent.jsonl` (append-only, 0600) | kept until user deletes; exportable |
| Practice history | inside session files (+ `lastScore` index in `copilot/index.json`) | rebuildable |
| Audio | **never written** | PCM only in memory ring buffers |
| Whisper MLX runtime + model (M1, macOS) | `~/.careerloom/stt/` (venv + pinned model) | install pattern of `prescreen-model.ts`; nothing bundled in installers |
| Price table | `electron/copilot/prices.json` (bundled, dated) | user-overridable in `copilot.json` |

Retention sweep on app start, on session end and immediately when the setting changes: `retentionDays = 0` → delete transcript text at stop (keep the summary row); `N > 0` → delete text older than N days (**default 90 = 3 months**); `null` → keep until the user deletes. Lowering the value shows how many sessions will lose their text and asks for confirmation before deleting.

## 6. STT adapter interface

```ts
export interface SttAdapter {
  readonly id: 'whisper-mlx' | 'soniox' | 'assemblyai' | 'deepgram' | 'apple' | 'whisper-cpp' | 'fake'   // M1: whisper-mlx + fake
  start(opts: { source: SourceId; language: string; vocab: string[]; endSilenceMs: number }): Promise<void>
  push(pcm16: ArrayBuffer): void                          // 16 kHz mono
  on(ev: 'partial' | 'final' | 'endOfTurn' | 'error' | 'closed', cb: (e: SttEvent) => void): void
  stop(): Promise<void>
}
export type SttEvent = { text: string; t0: number; t1: number; confidence?: number; retrying?: boolean; message?: string }
```
One adapter instance per source. `fake.ts` replays a fixture (`.jsonl` of timed events, optional `.wav`) for tests and the latency harness.

## 7. Config schema (defaults)

```ts
export type CopilotConfig = {
  version: 1
  audio: { micDeviceId: string | null; useSystem: boolean; systemSource: 'loopback' | 'virtual'; virtualDeviceId: string | null }
  stt: { engine: 'whisper-mlx'; model: string | null /* resolved from recommended-models.json after spike S2 */; language: string; endSilenceMs: number; vocab: string[] }   // cloud engines are a later union member
  engine: { tier: 'fast' | 'balanced' | 'deep'; escalateForDesignCoding: boolean; provider: 'openrouter'; openrouter: { dataCollection: 'deny' | 'allow'; zdr: boolean; sort: 'latency' | 'price' }; models: Record<'fast' | 'balanced' | 'deep', string | null>; factCheck: boolean; vision: 'vision' | 'ocr'; autoAnswer: boolean }
  coaching: { shape: 'cues' | 'cues+star' | 'script'; length: 1 | 2 | 3; tone: 'direct' | 'warm' | 'formal'; persona: string; quoteResume: boolean }   // never-invent-numbers is not configurable
  overlay: { layout: 'strip' | 'panel'; anchor: Anchor; displayId: number | null; width: number; fontPx: number; opacity: number /*0.6–1*/; theme: 'app' | 'dark' | 'light'; clickThroughIdle: boolean; aboveFullscreen: boolean }
  hotkeys: Record<'answer' | 'followup' | 'clarify' | 'screenshot' | 'summarise' | 'expand' | 'listen' | 'toggle' | 'quickHide', string> & { panic: string /* fixed default */ }
  privacy: {
    retentionDays: number | null /* 0 = don't keep, null = until deleted; default 90 */; localOnly: boolean /* also requires a local LLM (M4) */; redact: boolean      // per-session consent is a constant, not a setting
    mode: { enabled: boolean; noticeVersion: string | null; hideFromCapture: boolean; noDockIcon: boolean; neutralTitle: boolean; indicator: 'chip' | 'dot' | 'off' }   // all false / 'chip' by default; ignored unless enabled + notice acked
  }
  practice: { followups: boolean; readAloud: boolean; answerMinutes: number }
}
```
Defaults: tier `fast`, escalate on, provider `openrouter` (`dataCollection:'deny'`), `autoAnswer:false` (answer on demand), shape `cues+star`, `retentionDays:90`, redact on, opacity 0.94, anchor `tr`, width 440, hotkeys `⌃⌥A/F/C/S/M/E/L/H`, quick hide `⌃⌥⇧H`, panic `⌃⌥⇧X` (Windows: Ctrl+Alt). Model ids are **not** hard-coded: resolved from a dated `recommended-models.json` (prices and ids change) and shown in the UI.

## 8. Renderer structure

```
renderer/sections/Copilot.tsx                    side-nav shell (copy of Resume.tsx structure)
renderer/sections/copilot/{Setup,Practice,Audio,Transcription,Engine,Coaching,Appearance,Hotkeys,Privacy,Sessions}.tsx
renderer/components/copilot/
  ReadinessStrip, JobPicker, ContextTiles, ConsentGate(dialog), PermissionFix, LevelMeter(canvas/AnalyserNode),
  HotkeyRow, ScoreCard, AnswerReview, OverlayPreview (shares OverlayView)
renderer/overlay/                                 second entry (same vite build, `overlay.html` or `?overlay=1` branch in main.tsx)
  Overlay.tsx (strip|panel), ListeningChip, QuestionBanner, SuggestionCard (response-stream), ActionRow, Transcript (message/bubble),
  ProblemPanel (permission|error), useCopilotEvents.ts, capture/{mic.ts,system.ts,worklet.js}
renderer/lib/copilot.ts                           bridge hooks, event subscription, derived OverlayViewState
```
Edits to shared files (Sidebar.tsx `Section`/`navGroups`, App.tsx `TITLES`/`KEYS`/render switch, icons.tsx, `CareerloomBridge` type, preload) are **owned by WP0 only**.
UI kit adds (M1): shadcn `message bubble marker message-scroller`; prompt-kit `response-stream text-shimmer loader` (copy, keep MIT notices). Review each pulled file for bare tags against unlayered legacy CSS (no preflight).

## 9. Security and privacy model

| Topic | Design |
|---|---|
| Permissions | Mic via `askForMediaAccess`; system audio via OS prompt (macOS `NSAudioCaptureUsageDescription`); screenshots need Screen Recording. Add `setPermissionRequestHandler` allowing only `media` for the app's own windows |
| Where data goes | **Audio stays on the Mac** (local Whisper MLX). Text (transcript window, grounding prefix, question) → **OpenRouter** and whichever model provider it routes to. Said in plain words in the consent gate and on the Transcription/Answer engine pages. Local-only mode (needs a local LLM, M4) blocks all copilot network calls (enforced in main) |
| Consent | Per-session gate; `copilotStart(live)` refuses without a fresh `ConsentRecord`; system audio off by default; jurisdiction picker adds stronger text for all-party places |
| Indicator | Listening chip (default) is rendered from main-process capture state, not renderer state. Privacy mode may switch it to a small dot or off on the overlay; the **tray/menu-bar icon always shows capture state** and carries "Stop now". The chosen indicator is recorded in the session's consent record |
| Privacy mode | Opt-in, OFF by default, honoured only after a versioned notice ack (validated in main). Flags live in one file (`privacy-mode.ts`); a grep test forbids process-title/app-id/name changes. Hide-from-capture is labelled unreliable on macOS 15+ and useless against cameras/proctoring |
| Kill switch | Panic hotkey + tray "Stop now" + red stop button → `copilotStop('panic')`: stop capture tracks, close STT sockets, abort engine requests, hide overlay, then notify renderers. Also on `before-quit`, `render-process-gone`, `uncaughtException`, renderer heartbeat loss (5 s) |
| Redaction | Names/emails/phones in transcript text replaced with tokens before LLM calls when enabled (regex MVP) |
| Secrets | `safeStorage` only; never sent to renderers; never logged; provider errors scrubbed of headers |
| Prompt injection | Transcript is untrusted text: inside a fenced data block, system prompt forbids following instructions in it; output parsed as text sections only (no tool calls, no URLs fetched) |
| Retention | Raw audio never stored; transcript per setting; session records deletable; export button |
| Logging | No transcript or answer text in `run-logs`; metrics only (latency, token counts) |
| Third-party data handling | OpenRouter requests send `provider.data_collection:'deny'` by default (only providers that don't collect/train on data; narrows the model list; the UI says so); `zdr` optional; per-provider retention is not fully known, so the consent gate says the text is sent to OpenRouter and its providers; choice reviewed at gate G-D |
| Stored transcripts | Default retention 3 months (`retentionDays`), editable in Privacy and Sessions pages; other people's words are stored on this device only, plain JSON 0600, deletable per session or all; retention value shown in the consent gate |

## 10. Cost and latency budget

Assumptions (from research §C4): 15 answers / 45 min, 5,000 cached-prefix + 800 uncached input + 300 output tokens per answer. Prices read 2026-10-01, will drift; the UI shows estimates and real spend.

| Option | First token target (after end-of-turn) | LLM per interview | STT per interview (interviewer only / both) | Notes |
|---|---|---|---|---|
| Fast = small model via OpenRouter | ≤ 1.0 s (hypothesis, unmeasured) | ≈ $0.005–0.05 | **$0 (local Whisper MLX)** | default |
| Balanced | ≤ 1.5 s | ≈ $0.10 | same | |
| Deep (Sonnet-class) | ≤ 2.5 s | ≈ $0.10–0.30 | same | design/coding only when escalation on |
| Agent CLI runners (claude/codex/opencode/agy) | multi-second spawn, no token stream | n/a | — | **not offered** for live; allowed only for debrief scoring |
| Local-only (M4: local LLM added) | STT ≈ 1–2 s partials (hypothesis), LLM 2–5 s (estimate) | $0 | $0 | weaker on design/coding; Whisper + LLM + call app on 16 GB is tight: one heavy model at a time |

Budget target approved at G1: **≈ $0.30 per interview** all-in; Deep per-question cap and a per-session spend ceiling (`copilot.json`, default $1.00) stop answering with a visible message rather than silently degrading.
Stage budget (hypothesis): silence wait 0.7–0.9 s + local Whisper decode ≈ 0.3–0.8 s + detector ≤ 50 ms + request ≈ 0.1 s + TTFT 0.5–0.9 s; with on-demand answers the silence wait is hidden because the user presses the hotkey after the question. **Gate G-C:** measured (a) Whisper final-after-silence p50 ≤ 0.8 s on the target Mac and (b) OpenRouter p50 first token ≤ 1.2 s, p95 ≤ 2.5 s on the fixture harness, else change model/size before building UI polish.

## 11. Work packages

Mirror the Resume/Browser/Job-page runs: one supervised worktree per package, branch `livelong99/copilot-wpN-<slug>` off the integration branch, milestone gates to the lead, cloned-profile QA, capped live runs. **One writer per worktree; each package owns its files; shared files are WP0's.** Live API budget per package: ≤ $2 (stated in each dispatch).

**Porting rule (Open-Cluely is the owner's project):** each ported file gets a header comment `// Ported from Open-Cluely (owner's project), adapted for Careerloom`, is converted to strict TS with typed errors, and never stores keys in plaintext (`safeStorage` via `readSecret/writeSecret`). **Never ported:** Chrome/system-process disguise (process title, fake app id/publisher/icon), 0.02-opacity stealth and cursor-shape tricks, `webSecurity:false`/ignored certificate errors, plaintext key file, LAN companion (`features/mobile-server/*`), `windows/legacy/*`, `logs.txt`. Source root: `Open-Cluely/src/`.

### WP0 — Contract, shell, nav (integration owner; small; first)
Files: `electron/copilot/types.ts`, `electron/contract.ts` (+1 line), `electron/copilot/handlers.ts` (stubs returning `not-implemented`), `electron/main.ts` (FEATURES entry), `electron/preload.ts`, `renderer/lib/types.ts` (`CareerloomBridge` additions), `renderer/components/Sidebar.tsx`, `renderer/App.tsx`, `renderer/components/icons.tsx`, `renderer/sections/Copilot.tsx` (shell + page stubs), `electron/copilot/config.ts` (+test).
Accept: `npm run typecheck && npm test` green; Copilot appears in sidebar with stub pages; config read/write round-trips; contract frozen and tagged in the dispatch message.
**Gate G-A:** lead approves contract + job-view dependency decision.

### WP1 — Overlay window, hotkeys, kill switch (parallel after G-A)
Files: `electron/copilot/{overlay-window,hotkeys,tray,panic}.ts` (+tests with mocked electron), `renderer/overlay/**` (Overlay, chip, banner, card, actions, transcript, problem panel, `useCopilotEvents`), `renderer/lib/copilot.ts`, overlay entry wiring in `renderer/main.tsx` (branch only), `renderer/components/copilot/OverlayPreview.tsx`.
Also: `electron/copilot/privacy-mode.ts` (+ `no-masquerade.test.ts`), `renderer/components/copilot/PrivacyModeNotice.tsx`.
Behaviour: states from design.md §4 driven by a **fake event generator** (no backend needed); click-through + hover regions; anchors per display; panic; **Privacy mode** per §3.5 (content protection, no Dock icon, neutral title, quick hide, indicator variants).
**Port from Open-Cluely (source → target, adaptation):**
| Source | Target | Adaptation |
|---|---|---|
| `windows/assistant/window.js` | `electron/copilot/overlay-window.ts` | Keep frameless/transparent/alwaysOnTop level/skipTaskbar/`showInactive`/unresponsive recovery; drop process-title, app-id and disguise bits; per-display anchors |
| `main-process/features/window/window-controller.js` | `overlay-window.ts`, `privacy-mode.ts`, `panic.ts` | size presets → width setting; move-to-edge → anchors; content protection → Privacy mode only; emergency hide → quick hide (hide + clear text, **no opacity trick**); hide window (not opacity) during screenshot capture |
| `main-process/features/window/window-constants.js` | constants in `overlay-window.ts` | — |
| `config.js` (shortcuts) | `electron/copilot/config.ts`, `hotkeys.ts` | new ⌃⌥ accelerators (Alt+Shift dropped: IME clash); register result checked, conflicts surfaced |
| `main-process/shared/safe-send.js` | reuse `broadcast`; port only the destroyed-window guard if missing | — |
| `renderer/features/layout/window-adjustments.js`, `features/settings/shortcut-manager.js` | overlay resize grip, `renderer/components/copilot/HotkeyRow.tsx` | React/TS; accelerator recorder UX |
| `windows/assistant/styles.css`, `renderer.html` | reference only | new overlay follows `design.md` and Careerloom tokens |
Accept: all 8 states + strip/panel + light/dark match `prototype/shots` within review; overlay never takes focus (manual macOS + Windows check); panic stops fake session in < 200 ms; vitest for state reducer, hotkey registration failure handling, anchor math.
**Privacy mode acceptance (vitest with mocked electron + manual):**
1. Defaults: Privacy mode off ⇒ `setContentProtection` never called with `true`, Dock icon untouched, normal title, indicator = chip.
2. Enabling without a notice ack for `CURRENT_NOTICE` ⇒ flags not applied (main-side check); with ack ⇒ applied to every overlay window, including windows created later.
3. `noDockIcon` hides the Dock icon only while a session is live and restores on stop, panic, `before-quit` and the crash path.
4. Neutral title is the constant `"Careerloom"`; no job/company/question text ever reaches `win.setTitle`.
5. Quick hide hides the overlay, wipes rendered text, leaves capture running, and the second press restores; tray state unaffected.
6. Indicator `dot`/`off` honoured only when Privacy mode is enabled; the tray/menu-bar icon reflects capture state in every indicator setting (test drives capture state changes).
7. `no-masquerade.test.ts` passes (no `process.title`, `setAppUserModelId`, `app.setName(` in `electron/**`).
8. UI: Privacy page toggles match `prototype/shots/config-privacy-*`; the notice appears once per notice version; turning the master switch off restores all defaults without confirmation.
9. Manual macOS 15+: toggle on, confirm the notice states the ScreenCaptureKit caveat; record whether capture exclusion works in the QA screen-share tool (evidence, not a promise).
**Gate G-E1:** screenshot + screen recording review by lead on a cloned profile.

### WP2 — Context builder, detector, streaming answer engine (parallel after G-A)
Files: `electron/copilot/{context,detector,engine,prompts,guard,cost,redact}.ts`, `electron/copilot/providers/openrouter.ts`, `electron/copilot/prices.json`, `recommended-models.json`, tests + `electron/copilot/fixtures/**`, `scripts/copilot-latency.mjs` (harness).
**Port from Open-Cluely:**
| Source | Target | Adaptation |
|---|---|---|
| `services/ai/prompts.js` | `electron/copilot/prompts.ts` | keep the Ask/Screen/Suggest/Notes action split; rewrite prompts with grounding, STAR shape, never-invent rule, injection fence |
| `services/ai/gemini-service.js` | `electron/copilot/providers/gemini.ts` (+ queue/backoff/history in `engine.ts`) | request queue, backoff, rolling history, chunk streaming; main path is SSE providers |
| `main-process/features/assistant/gemini-runtime.js` | `electron/copilot/failover.ts` | key rotation with **typed error codes** (no substring matching); keys from `safeStorage` |
| `services/ai/ollama-service.js` | `electron/copilot/providers/ollama.ts` | M4 local-only |
| `renderer/features/ai-context/{context-bundle,message-store,message-types,toggle-ui}.js` | `electron/copilot/context.ts` (budgeted bundle, newest-first) + per-line "AI on/off" in `renderer/overlay/Transcript.tsx` | TS types, char/token budget from config |
| `main-process/features/assistant/ipc.js` | `electron/copilot/handlers.ts` (action lock, flush pending STT text before answering) | `careerloom:copilot*` envelopes |

Accept: SSE parser unit tests (fragmented chunks, `[DONE]`, errors, abort); detector precision/recall on a 60-utterance labelled fixture ≥ 0.9 / 0.85; `proof[]` items are substrings of `cv.md` (property test); `factCheck` flags injected fake numbers; harness prints p50/p95 first-token for 3 providers with a $2 cap.
**Gate G-C:** latency numbers reviewed; provider/model defaults chosen.

### WP3 — Capture + STT (mic first; system audio behind a spike)
Files: `renderer/overlay/capture/**` (worklet, mic, system), `electron/copilot/stt/{adapter,whisper-mlx,vad,fake,ring,install}.ts`, `electron/copilot/stt/sidecar.py` (embedded script, `fit-sidecar.ts` style), `electron/copilot/audio-perms.ts`, `build/entitlements.mac.plist`, `package.json` `build.mac` (**only this package edits the mac block; integration owner merges**), `electron/copilot/session.ts` (capture+STT orchestration only).
**Port from Open-Cluely:**
| Source | Target | Adaptation |
|---|---|---|
| `services/assembly-ai/service.js` | reference for a later cloud `SttAdapter` (not M1) | reconnect + ring-buffer ideas feed `stt/ring.ts`; any cloud key via `safeStorage` |
| `services/assembly-ai/stt-history.js` | `electron/copilot/stt/merge.ts` | merge finals per source inside ~2.4 s |
| `services/assembly-ai/ipc.js` | `handlers.ts` | audio chunks over `send`, not invoke |
| `windows/assistant/pcm-capture-worklet.js` | `renderer/overlay/capture/worklet.js` | as-is, 16 kHz PCM16 frames |
| `renderer/features/assembly-ai/audio-pipeline.js` | `renderer/overlay/capture/{mic,system,pipeline}.ts` | replace naive averaging downsample with a proper resampler; add 3 s silent-source detector; system path via `setDisplayMediaRequestHandler` (new; spike S1) |
| `renderer/features/assembly-ai/{source-state,transcript-buffer}.js` | `capture/source-state.ts`, `stt/buffer.ts` | TS |
| `renderer/features/transcription/transcription-manager.js` | `renderer/overlay/useCopilotEvents.ts` (partial/final transcript state) | React hook |
macOS system audio has no source to port (Open-Cluely relies on Windows loopback): new work behind S1.

Steps: (1) mic → 16 kHz PCM → fake STT replay parity test; (2) Whisper MLX sidecar + chunker + install flow; **spike S2 (time-boxed 1 day, Apple Silicon 16 GB):** pick model size (tiny/small/turbo-class), measure partial cadence, final latency, RAM/CPU with the call app running, WER on fixture audio, verify MLX's Apple-Silicon-only requirement; restart/replay handling; (3) **spike S1 (time-boxed 1 day)** on a signed or ad-hoc-signed build on macOS: loopback vs system-picker vs BlackHole, record which work, silent-track detector, TCC prompt behaviour across updates; (4) Windows: assert Live is refused and Practice works (no audio code reachable).
Accept: mic-only end-to-end in a dev build; `silent` health fires within 3 s of a dead track; adapter contract tests pass for fake + real (real behind `CL_LIVE_STT=1`, ≤ $0.50 cap); spike report committed.
**Gate G-B:** go/no-go on system audio per platform, written from S1 evidence.

### WP4 — Config UI, practice, sessions & debrief (parallel after G-A; consumes WP1–3 via contract)
Files: `renderer/sections/copilot/**`, `renderer/components/copilot/**` (except OverlayPreview), `electron/copilot/{store,practice,debrief,handlers}.ts`, THIRD_PARTY_NOTICES additions.
**Port from Open-Cluely:** `services/state/app-state.js` → `electron/copilot/store.ts` (sessions JSON; **keys removed**, moved to `safeStorage`); `main-process/features/settings/ipc.js` → config handlers (return `hasKey` booleans only); `renderer/features/settings/settings-panel-manager.js` and `features/chat/chat-ui-manager.js` → reference only for the React pages and transcript.
Scope: all 10 pages to match `prototype/shots` (incl. Privacy mode group + notice); consent gate dialog (+ server-side validation in `handlers.ts`); practice runner (mock interviewer question queue from report interview plan; follow-ups via engine); sessions table, scorecard (LLM-scored via the **text-only** neutral run, cheap model), Apply to résumé bullets / job notes.
Accept: retention control (Privacy and Sessions pages) defaults to 3 months, applies the sweep on change and confirms before deleting sessions newly out of range; on Windows "Start live session" is disabled with an explanation and Practice works; pages pass a11y checks (labels, focus order, Esc on dialog; the Privacy mode switch announces its state and opens the notice dialog first); `copilotStart(live)` without consent rejected (test); retention sweep tests; practice session end-to-end on fake STT + fake provider.
**Gate G-D (legal/policy):** lead/user reviews consent text, **Privacy mode notice text**, employer-policy link text, default provider, retention defaults before Live is enabled in a release build.

### WP5 — Later milestones (separate dispatches, not started now)
M3 screenshot→vision (`desktopCapturer`, image to vision model, FIFO cap + crash sweep, Screen Recording guidance). **Port:** `main-process/features/assistant/screenshot-manager.js` → `electron/copilot/screenshots.ts` (FIFO cap, cleanup on clear/quit, add crash-recovery sweep, temp dir), `services/ocr/service.js` → `electron/copilot/ocr.ts` (tesseract.js, fallback only); M4 local LLM (Ollama port), Windows Live via a new STT adapter (whisper.cpp or a cloud adapter), Windows voice practice, Apple SpeechAnalyzer as an alternative adapter; Windows hardening and installer tests; notarization.

### Sequencing
```
WP0 ─G-A─┬─ WP1 (overlay) ──────────────┐
         ├─ WP2 (engine) ─G-C───────────┼─ integration + cloned-profile QA ─G-D─ M1 release (practice + mic-only live)
         ├─ WP3 (mic; spike S1) ─G-B────┤                               └─ M2 (system audio) if G-B = go
         └─ WP4 (UI, practice, sessions)┘
```
Integration owner (lead's worktree) merges in order WP0 → WP2 → WP3 → WP1 → WP4, runs `npm run typecheck && npm test && npm run build`, resolves `package.json`/`main.ts`/`App.tsx` conflicts.

## 12. Test strategy

- **Unit (vitest, existing setup):** config defaults/migration; consent validation; detector; SSE parser; prompt builder (golden prompt snapshot for a fixture job); `proof` substring invariant; redaction; retention sweep; hotkey conflict handling; anchor math; overlay state reducer.
- **Fixtures:** `electron/copilot/fixtures/{interview-behavioural,interview-design}.jsonl` (timed STT events, original synthetic dialogue) + optional synthetic `.wav` via local TTS; fake STT replays at 1× and 4×; fake provider streams canned SSE with configurable TTFT.
- **Latency harness:** `node scripts/copilot-latency.mjs --provider openrouter --runs 20 --max-usd 2` (plus `--stt whisper-mlx` for decode latency on recorded fixtures) → p50/p95 TTFT, total, tokens, cost; output JSON checked into `docs/plans/interview-copilot/measurements/` per run.
- **Overlay QA (manual, cloned profile):** `--user-data-dir` copy + career-ops copy (repo rule); checklist: no focus steal over a real call app, above full-screen app, second monitor, click-through + hover, panic, Spaces switch, sleep/wake, dark/light, reduced motion, 200 % text. Windows: DPI scaling, taskbar z-order, exclusive full-screen caveat.
- **Permission matrix (manual):** fresh mac profile → mic prompt; system audio denied/allowed; revoke mid-session; app update (ad-hoc signed identity changes may reset grants — record outcome).
- **Live-provider smoke:** behind `CL_LIVE=1`, capped spend, never in CI.
- **Screenshot regression:** render prototype vs app screens by eye at gates (no pixel-diff infra yet).
- **Coverage:** ≥ 80 % on `electron/copilot/**` logic files (repo rule); UI covered by component tests for ConsentGate, PermissionFix, hotkey rows.

## 13. Packaging

- `package.json` `build.mac`: add `extendInfo` `{ NSMicrophoneUsageDescription, NSAudioCaptureUsageDescription }` (plain-language strings, reviewed at G-D); add `entitlements`/`entitlementsInherit` → `build/entitlements.mac.plist` with `com.apple.security.device.audio-input` (effective when `hardenedRuntime` is turned on at signing time; today it is off and builds are ad-hoc signed — **TCC grants may not persist across ad-hoc-signed updates; verify in S1, signing/notarization is the real fix**). Screen Recording has no usage-string key to add (system prompt names the app; verify).
- CSP: no widening of `connect-src`. Worklet served from `'self'`. If a blob worker is needed add `worker-src 'self' blob:` only.
- Overlay window: same preload, `sandbox:true`, `contextIsolation:true`, `webSecurity` left on (explicitly not copying any reference-project flags).
- Windows NSIS: no extra entries for loopback; test on x64 + arm64; `npx.cmd`/path issues already tracked.
- Nothing ML in installers; M4 models install from onboarding-style flow.
- Release: follow existing recipe (`CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac/--win`); tag only when the user asks.

## 14. Phased rollout

| Milestone | Scope | Release gate |
|---|---|---|
| M0 | WP0 | G-A |
| M1 (v0.3.0) | Practice + mic-only live + streaming runner + consent gate + kill switch (WP0–WP4) | G-B(mic ok), G-C, G-D, cloned-profile QA, user confirms defaults |
| M2 | System audio (macOS per spike) | G-B = go; permission matrix passed |
| M3 | Screenshot → vision | privacy review of screen capture |
| M4 | Local LLM, Windows Live STT, notarization, extras (pace/filler coaching, extra providers) | hardware test on 16 GB Mac |

Feature flag `copilot.enabled` (default on in dev, off in first public build) and a runtime **Live disabled** fallback if consent text version is missing.

## 15. Provisional defaults (change here first)

| Decision | Current default | Where it bites |
|---|---|---|
| Responsible-use option | **B** + opt-in Privacy mode: practice first; live = per-session consent; no disguise features | §9, WP4 consent gate, design §7 |
| Privacy mode (hide-from-capture, no Dock icon, neutral title, click-through, quick hide, indicator) | **Opt-in, OFF**; notice on first enable; indicator default = chip | `privacy-mode.ts`, Privacy page group |
| MVP scope | Practice + mic-only + streaming API runner | §14 |
| Platforms | **macOS Apple Silicon = Live + Practice; Windows = Practice only** (user, 2026-10-01) | WP3, §3.1, §12 |
| Budget | ≈ $0.30 per interview; per-session ceiling $1.00 | §10, `engine.ts` |
| STT | **Whisper MLX, local** (user, 2026-10-01); adapter interface kept for later engines | WP3, spike S2 |
| LLM | **OpenRouter** with `data_collection:'deny'` (user, 2026-10-01) | WP2, `engine.openrouter` |
| Auto-answer | **Off: answer on demand** (user, 2026-10-01) | `engine.autoAnswer` |
| Transcript retention | **3 months (90 days)**, editable in the app (user, 2026-10-01) | `privacy.retentionDays` |

## 16. Licence and notice obligations

- **Open-Cluely:** the user's own project ⇒ ports allowed. Keep the per-file "Ported from Open-Cluely" header and one attribution line in `THIRD_PARTY_NOTICES.md`. Adding a `LICENSE` to Open-Cluely is the owner's call. Git history shows other contributors; see open question 10.
- **shadcn/ui** (MIT) and **prompt-kit** (MIT): keep notices for copied files; list in `THIRD_PARTY_NOTICES.md`.
- **Do not add:** coss ui / Origin UI (AGPL-3.0), Aceternity (licence unverifiable), AI Elements `message`/`reasoning`/`persona`.
- STT/LLM providers: user-supplied keys, provider terms linked in UI; no vendor credit in public-facing text (repo rule: vendor-neutral wording; runners listed neutrally).
- Dependencies expected: none new for M1 beyond copied shadcn/prompt-kit files (`ws` only if the STT adapter needs a Node WebSocket; Electron's built-in `WebSocket` in main to be checked first). Every new package needs a licence check before adding.

## 17. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| macOS system-audio capture fragile (docs disagree, open issue on our Electron version, silent failure) | M2 slips | spike S1 + G-B; silent detector; BlackHole path; mic-only ships anyway |
| First-token latency > 1.2 s p50 | suggestions arrive too late to help | harness at G-C; small model; eager start; shorter prefix |
| False question triggers / missed questions | distraction | rules + classify; on-demand default; user hotkey always available |
| Unsupported claims in suggestions | user says something false | proof must be a substring of résumé; `factCheck` flag; never-invent rule not configurable |
| Consent/legal: recording the other party | user harm, product reputation | per-session gate, system audio off by default, jurisdiction text, practice-first, legal review at G-D |
| Employer policy bans AI in interviews | candidate penalised | gate text + policy link; Practice path promoted; Privacy mode notice repeats it; no "undetectable" wording anywhere |
| Privacy mode gives false assurance (macOS 15+ ScreenCaptureKit ignores content protection; cameras/proctoring unaffected) | user relies on it | off by default, notice says so, row badge "Unreliable on macOS 15+", QA evidence recorded, no marketing claims |
| Low-profile features drift toward evasion | reputational/ethical | scope limit in §1, `no-masquerade.test.ts`, review checklist at each gate |
| Overlay steals focus / blocks the call | trust | non-focusable panel, hotkeys, click-through, manual QA checklist; `type:'panel'` semantics verified on signed build |
| Ad-hoc signed updates reset TCC permissions | repeated permission prompts | record in S1; signing/notarization (M4) |
| Provider retention/training of prompts | privacy | provider notes in UI, redaction, local-only mode, default chosen at G-D |
| Cost drift (prices change) | surprises | dated price table, session ceiling, real-cost display |
| 16 GB Mac contention (local models + call app) | hangs | local mode one heavy model, memory check like `assertMemory()` |
| Contract churn between parallel WPs | integration pain | contract frozen at G-A; changes via WP0 owner only |

## 18. Open questions for the user

1. **Confirm the defaults:** option B (per-session consent, practice first) plus Privacy mode OFF by default with the one-time notice (macOS 15+ ScreenCaptureKit caveat), quick-hide hotkey `⌃⌥⇧H`, indicator choices full / small dot / off (tray icon always on). Anything to add or cut from the Privacy mode list?
2. **Legal/policy review:** who signs off the consent text and the "check the employer's rules" copy (gate G-D)? Any jurisdictions to call out beyond the generic all-party note?
3. ~~STT provider~~, 4. ~~LLM provider~~, 5. ~~Auto-answer~~ — **resolved by the user (2026-10-01): Whisper MLX, OpenRouter, answer on demand.**
6. **System audio:** acceptable to ship M1 mic-only and let the interviewer side wait for M2 (spike outcome)? Is BlackHole (user-installed) an acceptable fallback?
7. ~~Windows~~ — **resolved: Windows is Practice only.** New: should Windows Practice use typed answers only for now, or is voice practice worth a Windows STT adapter earlier?
8. ~~Retention~~ — **resolved: 3 months, editable.** Still open: may saved sessions feed the Resume/Job pages automatically, or only on explicit Apply (plan assumes explicit)? Is holding an interviewer's words for 3 months acceptable for the consent copy (plan says so on screen)?
9. **Apple signing/notarization** budget: ad-hoc builds may keep re-prompting for permissions.
10. **Open-Cluely ownership:** you own it; adding a `LICENSE` is your call. Git history lists other contributors: confirm their contributions may be ported, or limit ports to files you wrote.
11. Is `feat-job-page`'s `reportParse` contract final (Interview Plan STAR stories), and who owns changes to it?
12. **Whisper MLX model and install:** which size/quality trade-off (decided from spike S2), and is an on-demand download in onboarding acceptable? Does live use require Apple Silicon only (Intel Macs get Practice only)?
13. **OpenRouter defaults:** `data_collection:'deny'` narrows the available models/providers; accept that, or allow per-model opt-in? Which default models per tier (resolved from `recommended-models.json`, dated)?
