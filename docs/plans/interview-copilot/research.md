# Interview Copilot — Research (Phase 1)

Date: 2026-10-01 · Branch: `livelong99/feat-copilot-plan` · Scope: docs only, no product code.
Full evidence (URLs, VERIFIED vs INFERENCE tags, "could not verify" lists) lives in `research-notes/A…F`. This file is the synthesis.
Caveat on sources: the fetch tool summarises pages with a small model; prices/versions below were read on 2026-10-01 and change. Not legal advice.

## 0. Decisions needed at G1 (summary)

| # | Decision | Recommended |
|---|---|---|
| 1 | Open-Cluely reuse | Ideas only, clean-room. Ask authors for a licence if we ever want more |
| 2 | Responsible-use default | **Option B**: Practice mode first; Live mode = visible "Listening" chip + per-session consent + policy acknowledgement; no stealth |
| 3 | Hide-from-capture | Not shipped in MVP (unreliable on macOS 15+, reads as cheating); revisit as off-by-default "hide from *my own* screen share" |
| 4 | STT | MVP: cloud streaming, two channels (Soniox or AssemblyAI; Deepgram Flux if endpointing matters). Local-only later: Apple SpeechAnalyzer (macOS 26+) else whisper.cpp |
| 5 | Answer runner | New in-process **streaming** runner (SSE) on API/Zen/OpenRouter-style endpoints; default small fast model; "deep" escalates. Agent CLIs are not viable for live |
| 6 | Components | shadcn core (`message bubble marker message-scroller`) + prompt-kit (`response-stream text-shimmer loader`); hand-build meter/stepper/suggestion card; avoid AI Elements heavy parts, coss ui (AGPL), Aceternity |

## A. Open-Cluely analysis (clean-room reference only)

Detail: `research-notes/A-open-cluely.md`.

**Licence finding (plain):** no `LICENSE` file, `package.json` licence field is null ⇒ all rights reserved by default. We may study ideas; we may **not** copy code, prompts, UI text or assets. Everything we build is a clean-room rewrite from behaviour. If we want to do more than ideas, ask the authors to add MIT/Apache-2.0; until then log it in `THIRD_PARTY_NOTICES.md` as "reference only, not used".

**What it is:** Electron 28, plain JS, vanilla renderer. Main process wires services: AI (Gemini, request queue/backoff, rolling history, undocumented Ollama option), AssemblyAI streaming STT (one websocket per source), tesseract.js OCR + screenshot-desktop, JSON-persisted state.

**Overlay (behaviour):** frameless, transparent, always-on-top at a high level, skip-taskbar, shown without focus, all-workspaces on macOS, dock hidden. Click-through is *not* used. "Stealth" = content protection + near-zero opacity. Global hotkeys (18, `Alt+Shift`-based, config-file only).

**AI actions:** Ask (transcript + summary + screenshots + OCR), Screen (screenshots + OCR), Suggest (short speakable reply from transcript), Notes; per-message "AI on/off" toggles feed a newest-first 12k-char context budget.

**Transcription:** mic = "You", system loopback = "Host" (labels by source, no diarisation). System loopback works on Windows via Chromium desktop capture; no macOS path. Mobile companion on an unauthenticated LAN port. Screenshots FIFO-capped (50), wiped on quit.

**Works well:** per-message context toggles + budget; per-source STT; no-focus show; emergency hide; key failover.
**Weaknesses:** plaintext keys sent to renderer, open LAN server, web security/cert checks disabled, full-screen captures sent to a cloud model, disguise as a browser/system process, stealth-first marketing with a one-line disclaimer, one test file, mac host audio missing.

### Reuse matrix

| Item | Verdict |
|---|---|
| Transparent always-on-top overlay, no-focus show, all-workspaces | Idea → clean-room from Electron docs |
| Per-message context toggles + char budget | Idea → clean-room (strong UX) |
| Four-action split with different context slices | Idea → our own prompts/actions |
| Dual-source STT, label by channel, merge finals in a short window | Idea → clean-room |
| Key failover (rotate on quota, restore index) | Idea → clean-room with typed errors |
| Screenshot FIFO cap + cleanup | Idea → add crash sweep, temp dir |
| Emergency hide / unresponsive recovery | Idea → clean-room |
| OCR-as-text grounding | Idea; prefer vision model or native OCR |
| Content protection / stealth opacity / cursor trick | Skip (see §E) |
| Browser/system-process disguise, fake publisher | Skip (impersonation) |
| Mobile LAN companion | Skip (if ever: pairing token, TLS/tunnel) |
| Plaintext key file, disabled web security | Skip (we use `safeStorage`) |
| Code, prompts, copy, icons | Skip (copyright) |

## B. Careerloom building blocks (verified in repo)

Detail + file:line: `research-notes/B-careerloom-blocks.md`.

- **Window/IPC:** one `BrowserWindow` (`electron/main.ts:292`), `sandbox:true`, `contextIsolation:true`. IPC = `FEATURES` handler modules registered as `careerloom:<name>` returning `Envelope`; `broadcast()` (`context.ts:92`) sends to all windows, so an overlay window receives pushes for free. No hash routes: an overlay window would load the same `index.html` with a query flag and branch in `renderer/main.tsx`.
- **CSP:** `<meta>` in `renderer/index.html` with `connect-src 'self'` (+ dev server). No network from the renderer: all STT/LLM traffic goes through main. Mic/worklet needs `worker-src`/`media-src` review.
- **Build:** mac ad-hoc signed, `hardenedRuntime:false`, **no entitlements, no `extendInfo`, no mic/audio usage strings** — all must be added.
- **Runners:** `startAgentPrompt` spawns CLIs (stream-json parsed per line: progress, not tokens; seconds of start-up). `runZen` is in-process but **non-streaming** `fetch` — no SSE anywhere in `electron/`. Reusable: `readSecret` (`safeStorage`), `zenError`, `ZEN_URL`, `zenModel`, `Settings.models`, retry shape. Missing: SSE `fetch`, abort, push events. (No `helperModels` concept exists; model = `Settings.models[runner]`.)
- **Optional installs:** `prescreen-model.ts` (venv + pinned weights under `~/.careerloom/model`, memory check, selftest) is the template for local STT/LLM. `fit-sidecar.ts` is one-shot JSON stdin/stdout, tracked and killed on quit — a streaming STT sidecar would be a *new* long-lived process pattern.
- **Grounding data:** **`electron/job-view/*` does not exist on this branch** (presumably the Job-page agent's work in a sibling worktree) and nothing parses `## F) Interview Plan` / `## E) Personalization Plan`; reports are raw markdown via `readReport`. Available now: `readCv()`, `currentProfile()`, `JobListing`, `listReports/readReport`, and `ats/factCheck.ts` `factCheck(before, after, answers)` (pure; reusable as a post-hoc grounding gate on a draft answer vs `cv.md`). **Plan dependency:** copilot context builder consumes the Job-page work's structured posting/report contract; fallback is a small heading splitter (`^## [A-Z]\)`).
- **Navigation:** `Section` in `Sidebar.tsx:9`; adding one touches `TITLES`, `KEYS`, `navGroups`, render switch in `App.tsx`, icon in `icons.tsx`. Resume side-nav shell (`sections/Resume.tsx` + `sections/resume/*`) is the pattern for the Copilot config pages.
- **UI kit/tokens:** shadcn new-york in `components/ui` (list in notes), Tailwind v4 **without preflight** (`tw.css`), tokens mapped from `careerloom.css` (light accent `#0d7d6e`, dark `#2dd4bf`, amber `--thread #d98a0b`, 32 px controls, Badge tones neutral/brand/success/warn/danger/info/violet, `.workspace`).
- **Audio code:** none. **Persistence:** `userData` JSON/jsonl patterns (`runs.jsonl`, `run-logs`, `zen-sessions`, `ats/`, chat threads).
- **Tests:** vitest, node env default, `fileParallelism:false`, electron mocked.

## C. Feasibility (cited in `research-notes/C-feasibility.md`)

### C1. Audio capture (Electron ^43.7.0)
- Mic: `getUserMedia` + AudioWorklet (16 kHz PCM16, ~80–100 ms frames). Needs `NSMicrophoneUsageDescription` + `com.apple.security.device.audio-input` (when hardened). `systemPreferences.getMediaAccessStatus/askForMediaAccess` (macOS) — electron v43.7.0 `system-preferences.md`.
- **System/loopback audio is the #1 risk.** v43.7.0 `session.md`: `audio:'loopback'` "currently only supported on Windows". `desktop-capturer.md` (same version) describes macOS 14.2+ CoreAudio Tap, needs `NSAudioCaptureUsageDescription`; **if missing the track is silently `ended`, no error**. Open issue electron/electron#52738 (43.3.0, macOS 26.5.2): custom picker (`useSystemPicker:false`) → dead track; workaround `useSystemPicker:true`. macOS ≤12 needs a virtual device (BlackHole). Docs contradict each other → **mandatory spike**.
- Native modules: none needed for getUserMedia + display-media handler (inference). Native only for Apple SpeechAnalyzer helper or bundled whisper.cpp/sherpa-onnx.
- Two-channel design: mic = candidate, system = interviewer ⇒ no diarisation needed; echo risk if speakers bleed into mic (recommend headphones / AEC).

### C2. Speech-to-text (prices read 2026-10-01, via page summaries)

| Option | Price | Notes |
|---|---|---|
| Soniox realtime | $0.12/h | 60+ languages |
| AssemblyAI Universal-Streaming | $0.15/h (per open session) | diarisation +$0.12/h |
| Deepgram Nova-3 / Flux | ~$0.29/h promo / $0.0065 min | Flux has built-in end-of-turn (~260 ms) + eager EOT event |
| ElevenLabs Scribe v2 RT | $0.39/h | ~150 ms claimed |
| OpenAI live transcription | ~$0.017/min (low confidence) | |
| Google Chirp 3 | ~$0.016/min (third-party sources only) | |
| whisper.cpp (local) | free, MIT | chunked ⇒ worse streaming latency; Metal on Apple Silicon |
| sherpa-onnx (local) | free, Apache-2.0 | streaming models unverified |
| Apple SpeechAnalyzer (local) | free, macOS 26+ | Swift-only ⇒ native helper; accuracy claims unverified |
| Vosk / faster-whisper | free, Apache-2.0 / MIT | lower accuracy / Python burden |

Vendor latency/accuracy claims are **not benchmarked**. 45-min interview STT: interviewer-only ≈ $0.09–0.11 (Soniox/AAI), both channels ≈ $0.18–0.23.

### C3. Question detection (design, inference)
Endpoint on the interviewer channel (STT EOT or ~700–900 ms silence) → rules (trailing `?`, openers "tell me / walk me through / how would you / design / implement…") → one tiny LLM call only for ambiguous turns returning `{question|statement, type: behavioural|technical|system-design|coding}` → speculative start at eager-EOT, abort if speech resumes. Embeddings add little over rules at MVP (`verdict-small` not needed).

### C4. Answer engine
- Direct in-process HTTPS streaming (SSE) to a small fast model; reuse Zen/OpenRouter plumbing. Agent CLIs: process spawn + agent loop, no token streaming path ⇒ unsuitable for a <2–3 s first token.
- Prompt caching (Anthropic docs): 5-min TTL, read 0.1×; Haiku 4.5 min cacheable prefix **4096 tokens** (shorter silently uncached) — build the grounding prefix `[system + résumé facts + JD + report]` ≥ 4096 tokens or accept no cache.
- Zen endpoints (`/zen/v1/responses`, `/messages`, `/chat/completions`); OpenAI models 30-day retention, free-trial models may train — privacy note.
- Assumptions: 15 answers / 45 min, 5,000 cached + 800 uncached input + 300 output tokens each.

| Tier (price per MTok in/out) | per interview (LLM only) |
|---|---|
| GPT-class low tier via Zen ($0.10/$0.50) | ≈ $0.005 |
| Gemini Flash-Lite ($0.30/$2.50) | ≈ $0.04 |
| Claude Haiku 4.5 ($1/$5) | ≈ $0.05 |
| Claude Sonnet 5.5 ($2/$10) | ≈ $0.10 (maybe ~30 % low: tokenizer) |

MVP total with STT ≈ **$0.15–0.30 per interview**.
- Latency target (inference): first token < 1.0 s after end-of-turn for a bullet suggestion, total < 4 s.

### C5. Screenshot / coding path
`desktopCapturer.getSources({types:['screen']})` (Screen Recording consent on macOS). Vision model (same multimodal model) preferred; `tesseract.js` 7.0.0 is Apache-2.0 but expected weak on code (untested) ⇒ offline fallback only. Vision token prices not fetched.

### C6/C7. Budget & offline
See C4 table. Local-only (16 GB Apple Silicon): SpeechAnalyzer or whisper.cpp (small.en/base.en, ~0.5–1 GB) + 3–8B Q4 LLM via Ollama/llama.cpp (~3–6 GB, unverified); one heavy model at a time; weaker on system-design/coding. Models downloaded in onboarding, never bundled.

### Top 3 feasibility risks
1. **macOS system-audio capture** (contradictory docs, open #52738, silent failure, unsigned build with no usage strings). Mitigation: spike first; "no samples in 3 s" detector; `useSystemPicker:true` path; BlackHole fallback; mic-only MVP.
2. **Latency vs false triggers** (<1 s to first token without answering non-questions). Mitigation: eager start + abort; hybrid detector; latency harness with recorded fixtures.
3. **Privacy/policy/compliance** (interviewer audio to cloud providers; employer bans; consent laws). Mitigation: §E default, local-only option, no retention by default.

## D. Overlay window techniques (cited in notes DE §D)

- Levels: `floating…status` sit below Dock/taskbar; `pop-up-menu` and up above (BrowserWindow docs). Use `status`/`floating` unless the overlay must cover the Dock.
- No focus steal: `showInactive()`; `setFocusable(false)` does not remove focus on macOS; true non-activating needs panel behaviour — Electron `type:'panel'` semantics **unverified, test on a signed build**. Mouse/hotkey-only overlay avoids most problems; text input belongs in a normal window.
- Click-through: `setIgnoreMouseEvents(true,{forward:true})` + renderer hover → IPC toggle (documented; mac/Windows only). Drag regions swallow pointer events and fight hover toggling ⇒ small dedicated drag strip. Transparent windows are unreliable when `resizable:true` ⇒ fixed window + inner resize, or own grip + `setBounds`.
- Full-screen/Spaces (macOS): `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`; side effect on Dock icon reported (use `skipTransformProcessType`). Windows exclusive-fullscreen apps may hide topmost windows (unverified).
- Global shortcuts: `register()` fails silently on conflict ⇒ check return, surface in settings, unregister on `will-quit`; avoid Alt+Shift (IME clash).
- Opacity: prefer CSS alpha on a solid-ish panel for legibility; window opacity stays 1.
- Multi-monitor: `screen` API, per-display bounds, re-anchor on `display-*` events (inference).
- **`setContentProtection`:** Windows `SetWindowDisplayAffinity` (10 2004+ excluded from capture); macOS `sharingType = none` but **macOS 15+ ScreenCaptureKit ignores it, no known workaround** (Tauri issue, Apple post not fetched). Does not stop cameras, capture cards, process lists, proctoring. Electron 44 regression on Windows remote sessions (43 unaffected).
- Accessibility (inference): keyboard-operable via global shortcuts; ≥4.5:1 contrast on a dimmed/solid panel; honour `prefers-reduced-motion`; `aria-live="polite"` for streaming text; a normal-window "reader view".
- Kill switch: panic hotkey (hide + stop capture + stop network), tray "Stop now" always present, recording indicator driven by the same state as capture, stop capture on `before-quit`/`render-process-gone`/`uncaughtException`, renderer heartbeat watchdog.

## E. Responsible use (required; cited in notes DE §E)

**Facts (VERIFIED where noted in notes):**
- US federal Wiretap Act is one-party (18 U.S.C. §2511(2)(d)). Commonly cited all-party states: CA, CT, FL, IL, MD, MA, MT, NH, PA, WA (+ DE/NV/HI/OR depending on source) ⇒ UI should treat the union as all-party.
- Transcribing the interviewer's audio = recording the **other party**. The user is a party, but all-party jurisdictions and cross-border calls still need the other side's consent. Zoom-style recording notices do **not** fire for a local app — that is exactly the consent gap.
- UK/EU: voice is personal data; sending it to a cloud provider makes the provider a processor and needs a lawful basis + notice. (EDPB voice guidance and India DPDP obligations not retrieved.) Canada/India: participant recording generally permissible (secondary sources); Australia varies by state.
- Employers: Amazon, Anthropic and Goldman Sachs have stated bans on AI in interviews; Google/Cisco/McKinsey added in-person rounds (Futurism, Entrepreneur, Axios — URLs in notes). A student was suspended after publicising use of a stealth tool in an interview. Named disqualification cases for live copilots were not found beyond that.
- "Undetectable" tools: marketing rebranded after backlash; hide-from-capture does not hide from process monitoring, eye-gaze/timing analysis or in-person rounds (detection claims are from competitor blogs, unverified).

**Options**

| | Description | Pros | Cons |
|---|---|---|---|
| A Practice-only | Mock interviews from the job's report, local | No third-party consent/policy issue; simplest | Less differentiated |
| **B Live + visible + consent (recommended default)** | Overlay on real calls; non-hideable "Listening" chip; per-session consent + policy acknowledgement; system audio off by default | Strong legal/ethical posture; useful for permitted uses (prep, calls the user hosts, AI-allowed interviews) | Friction; unusable where AI is banned |
| C Live + optional hide-from-capture | B + `setContentProtection` toggle | Privacy of own notes while presenting | Reads as cheating; unreliable on macOS 15+ ⇒ false assurance |
| D Stealth default | Hidden, no indicator | "Undetectable" marketing | Highest legal/ethical/reputation risk; contradicts vendor-neutral, trust-first positioning |

**Recommendation: B**, with A as the onboarding path; C omitted initially (later: per-session, off by default, worded "hide my overlay from *my own* screen share while I present", never marketed as undetectable). Additional defaults: raw audio deleted after transcription, transcript text kept 7 days unless saved, local-only option, provider data-flow disclosed on screen, no stealth wording in UI/marketing.

**Consent UX (per session, not once):** title "Before you start a live session"; two required checkboxes (AI assistance allowed here; everyone informed or law confirmed); optional jurisdiction picker with stronger note + copyable consent script for all-party places; system audio OFF by default with a one-line explanation; "Start live session" (disabled until both checked) and "Practice instead"; stored locally: session id, timestamps, acknowledgement text version, checkbox states, jurisdiction, sources, provider, whether transcript saved (no raw audio); export + delete-all. Full spec in notes DE §E5.

## F. Frontend components (dry-run; nothing installed)

Detail: `research-notes/F-components.md`. Already present: command, sonner, kbd, slider, toggle-switch, toggle-group, progress, tabs, sheet, spinner, resizable, empty, field, item, tooltip, badge, collapsible, skeleton, plus `Markdown.tsx`, `SegTabs.tsx`, `CommandPalette.tsx`.

| Library | Licence | Verdict |
|---|---|---|
| shadcn/ui core chat primitives | MIT | **Use**: `npx shadcn@latest add message bubble marker message-scroller` (may pull `avatar`; `bubble` uses `oklch(from var(--primary) …)` — check Electron 43's Chromium) |
| prompt-kit | MIT | **Use (small parts)**: `npx shadcn@latest add prompt-kit/response-stream prompt-kit/text-shimmer prompt-kit/loader prompt-kit/thinking-bar` (`text-morph`, `chat-container` add `motion`/`use-stick-to-bottom` — skip) |
| Vercel AI Elements | Apache-2.0 | Only `suggestion` (no external imports). `message`/`reasoning` pull `ai`, `streamdown` + plugins; `persona` fetches remote `.riv` ⇒ CSP violation |
| assistant-ui | MIT | Skip (chat runtime; we own the loop) |
| Kibo UI | MIT, last commit 2026-05-04 | Optional `status`/`pill`; **no stepper** |
| Magic UI | MIT | Skip (marketing effects, needs `motion`) |
| Aceternity | licence unverifiable | Skip |
| Origin UI → coss ui | **AGPL-3.0** | **Do not use** (same trap as VoiceStudio) |
| 21st.dev | per-author | Skip; `magic` MCP currently unauthenticated |

Hand-build: level meter (`AnalyserNode` + canvas/CSS bars), setup stepper (`Item` + `Progress`), streaming suggestion card (`card` + `skeleton` + `response-stream` + `kbd`), recording indicator. Caveat: pulled components without `data-slot` inherit unlayered legacy CSS — budget a review pass. Licence obligations: MIT/Apache notices into `THIRD_PARTY_NOTICES.md`. Exact add commands for AI Elements/Kibo/Aceternity/21st.dev registries were **not verifiable**; the ones listed above are from shadcn/prompt-kit docs.

## G. Not verified (carry into the plan as spikes)
Installed Electron (no `node_modules` here); macOS system-audio behaviour on the target OS; `type:'panel'` semantics; vendor STT latency/accuracy; Apple SpeechAnalyzer quality; local LLM speed on 16 GB; vision token prices; tesseract on code; Windows speech APIs; EDPB/DPDP specifics; registry URL forms for some libraries.
