# Open-Cluely analysis (behaviour only, no code/prompt text quoted)

Repo: `/Users/perkypanda/Documents/Obsidian/Vault/10_Projects/10-projects/Open-Cluely`
Contributors (git): Akash Singh, Shubham Shinde, HaryiankKumra. Electron 28, plain JS, no bundler, no TS.

**LICENCE (read first):** no LICENSE file, package.json has no licence field => all rights reserved by default. We may read and learn from ideas, we may NOT copy code, prompts, UI text or assets. Anything we reuse must be a clean-room rewrite from behaviour descriptions. Option: ask the authors (Shubham Shinde / Akash Singh on GitHub) to add an MIT/Apache licence; until then treat as reference-only.

---

## 1. Architecture
- Electron main process composed in `src/main-process/start-application.js` (factory-style DI, no classes for wiring): window controller, screenshot manager, Gemini runtime, AssemblyAI service, OCR service, mobile server, three IPC registrars (assistant, assembly-ai, settings).
- Preload bridge (`src/windows/assistant/preload/*`) exposes one `window.electronAPI` via contextBridge (contextIsolation on, nodeIntegration off). Renderer is vanilla ES modules (`renderer.js` 1.3k lines + `renderer/features/*`).
- Services:
  - `services/ai`: `gemini-service` (per-key instance; request queue, min interval between requests, exponential backoff retry, daily token estimate cap, rolling 20-message history, streaming via chunk callback), `ollama-service` (local alternative, undocumented in README), `prompts.js` (per-action system prompts; language preference injected).
  - `services/assembly-ai`: one WebSocket per audio source (mic and system separately) to AssemblyAI v3 streaming; 16 kHz PCM16 in; partial vs end-of-turn finals routed to renderer; `stt-history` merges finals per source inside a ~2.4 s window then pushes "Host: ..." / "You: ..." lines into the Gemini history.
  - `services/ocr`: tesseract.js worker (English, lazy, reused) reads the enabled screenshots; text is appended to the prompt context (Gemini provider only). `screenshot-desktop` does capture.
  - `services/state/app-state`: JSON file `cache/app-state.json` (dev: repo root; packaged: userData). Sanitised on every load and rewritten.
- IPC/event flow: main pushes events (stream chunks, stt partial/final, status) through one `sendToRenderer`; that sender is wrapped so every event is also broadcast to mobile WebSocket clients.
- Dead code: `windows/legacy/` (whisper, webspeech, vosk notes), `SETUP-VOSK.md`, `logs.txt` committed. Only one test file (OCR service), run with `node --test`.

## 2. Overlay window (src/windows/assistant/window.js + window-controller.js)
- BrowserWindow: frameless, transparent (bg fully transparent), alwaysOnTop, skipTaskbar, resizable, not minimizable / maximizable / closable, focusable true, hasShadow false, thickFrame false, hidden title bar, `type: 'toolbar'`, acceptFirstMouse false, disableAutoHideCursor true, `show:false` then `showInactive()` after load (never steals focus).
- Size: default 900x400, min 600x380, max = work area. Position: horizontally centred on primary display, y = 40. Four size presets (min, +25/50/75%), four move-to-edge hotkeys.
- Always-on-top level: `pop-up-menu` on both mac (relative level 1) and Windows.
- macOS: visible on all workspaces incl. over fullscreen apps, dock icon hidden, hidden in Mission Control. Windows: extra skipTaskbar call, custom app details with a fake app id. No Linux branch.
- Content protection: `setContentProtection(flag)`, flag from env `HIDE_FROM_SCREEN_CAPTURE` (default true). This is the OS capture-exclusion API (WDA_EXCLUDEFROMCAPTURE on Windows, sharingType none on mac). It is the whole "invisible" mechanism.
- Click-through: NOT used. `setIgnoreMouseEvents(false)` is called once and never toggled, so the window always takes clicks (and can be seen/clicked by user, but blocks the app below).
- Opacity: user level 1-10 (0.1-1.0). "Stealth" toggle drops opacity to 0.02 (window still exists, clickable by accident). Emergency hide drops to 0.01 for 2 s, clears renderer chat, then auto-restores. Screenshot capture also drops opacity to 0.01 for a delay (300 ms code default; .env.example says 1000) then restores - belt-and-braces in case content protection fails on the capture path.
- Robustness: on window/webContents "unresponsive" it forces visibility back and does a rate-limited renderer reload.
- Other: cursor shape deliberately never changes (no pointer cursors) so screen-share viewers cannot infer clicks. Renderer window has webSecurity off, insecure content allowed, sandbox off; app-level switches ignore certificate errors and disable web security. Permissions handler grants only microphone/media.
- Process/packaging disguise: process title set to a system-idle-like name; Windows build is called GoogleChrome.exe, product "Google Chrome (2)", appId com.google.chrome, publisher "Google LLC", Chrome icon.

## 3. Hotkeys (global, `globalShortcut`, configurable only by editing src/config.js; a settings UI manager exists for display/record)
All Alt+Shift+: T transcription toggle, S screenshot, A Ask AI, E Screen AI, G Suggest, N Notes, I Insights, C clear chat, X emergency hide, H stealth toggle, arrows move window, 1-4 size presets. Registration failures only logged. Alt+Shift combos collide with Windows input-language switching on many setups.

## 4. Settings and key storage, failover
- Settings panel edits: AI provider (gemini/ollama), Gemini keys (comma-separated list), Gemini model (4 listed), AssemblyAI key + speech model (english / multilingual streaming), programming language (9), opacity level, theme, hide-from-capture and start-hidden flags.
- Storage: keys are plaintext in `cache/app-state.json`; no OS keychain, no safeStorage. `get-settings` returns the raw keys to the renderer. Gitignored, but packaged `.env` is also bundled as an extra resource.
- Failover (`gemini-runtime.executeWithKeyFailover`): keys deduped; active index persisted. Each operation tries the active key; on quota-exhausted or auth-type errors (matched by message substring incl. "401"/"403") it rotates to next key round-robin and retries; other errors rethrow immediately. After a full loop it restores the starting index and throws an "all keys unavailable" error that the UI maps to a friendly message. Ollama bypasses failover. Error mapping to friendly strings is substring-based.
- Gemini service also keeps its own request spacing (~6 s min interval) - slows rapid-fire actions.

## 5. The AI actions (behaviour; 7 exist in code, README documents 4)
Shared: renderer builds a context bundle from chat messages the user left "AI on" (per-message toggle), newest-first within a 12,000 char budget, older lines dropped. One action at a time (lock). Output streams into chat.
- **Ask AI**: sends enabled transcript lines (Host/You labelled) + a short rolling summary of non-system messages (last ~16) + enabled screenshots as images + OCR text of those screenshots appended to transcript context + the service's rolling 20-turn history. Goal: infer the actual question, answer fully. Falls back to text-only if images unusable. Needs at least transcript, typed context, or a screenshot.
- **Screen AI**: only enabled screenshots (images) + OCR text + the enabled context string as an override. No transcript-specific slot. Errors if none enabled.
- **Suggest**: only enabled context text (transcript lines), no images; flushes pending STT buffers first; returns short speakable reply + anchors + likely follow-ups.
- **Notes**: enabled context text only; structured meeting-notes sections.
- Also in code/hotkeys but not in README: **Insights** (enabled context), plus IPC for follow-up email and answer-question (not wired to buttons as far as seen).
- STT buffers are flushed into history before Ask/Suggest/Notes so the latest speech is included.
- Mobile "Ask AI" is a cut-down path: typed text + ALL screenshots, no transcript, no OCR, no summary.

## 6. Dual-source transcription
- **Mic**: `getUserMedia` audio, mono, echo cancellation + noise suppression on; labelled "You".
- **Host/system audio**: renderer asks main for `desktopCapturer` screen sources (screen type only), takes the FIRST screen (primary), then `getUserMedia` with desktop chromeMediaSource (mandatory-constraint syntax, falls back to flat syntax). Audio + video requested; video track is checked (rejects if it looks like a camera) then stopped. This is Chromium's built-in desktop loopback: works on Windows with no virtual device. On macOS Electron 28 gives no system-audio loopback this way, so Host would be silent or fail (would need BlackHole/Loopback-style virtual device or ScreenCaptureKit path); no docs or code for that. No per-app capture; captures everything the PC plays, including the user's own call output.
- Pipeline: AudioWorklet -> Float32 queue per source -> naive averaging downsample to 16 kHz -> PCM16 frames of ~100 ms (min 50 ms) -> IPC -> one AssemblyAI socket per source. Default: Host on, Mic off.
- **Speaker labels**: not diarisation. Label is just which socket (Host vs You). Multiple people on the far end collapse to "Host"; if speaker audio bleeds into the mic it is double-transcribed. Finals get merged within 2.4 s per source before entering history.

## 7. Mobile companion (src/main-process/features/mobile-server)
- Plain Node `http` + `ws` server on fixed port 7823, bound 0.0.0.0, started with the app. HTTP serves one static page (`mobile.html`); everything else 404. WebSocket on the same server.
- Commands from phone: take-screenshot, ask-ai (typed text + all screenshots; streams chunks back), clear-conversation (also wipes desktop chat and screenshots). Server broadcasts every main-to-renderer event (stt finals labelled Host / You (mic), AI stream, screenshot count) to all clients.
- Discovery: enumerates IPv4 interfaces, sorts real adapters before virtual (docker, wsl, vmware, tailscale, tun/tap...), prints URLs and shows a pill with URL and client count in desktop UI. Docs cover Windows firewall (Profile Any) and USB tethering.
- **Auth: none.** No token, no origin check, no TLS, no pairing. Anyone on the LAN can trigger screenshots of the desktop (but screenshots are not sent to the phone, only used as AI context), spend the user's Gemini quota, read live transcripts and AI answers, and wipe session. README admits it. Plan doc shows mobile voice pipeline was removed.

## 8. Screenshot retention/cleanup
- `screenshot-desktop` full-screen PNG to `.stealth_screenshots/` (dev: repo; packaged: userData). In-memory list of {id, path, timestamp}. Cap `MAX_SCREENSHOTS` (default 50), oldest file deleted on overflow (FIFO). Whole list deleted on Clear and on app quit/will-quit. No crash-recovery sweep: files from a crashed run persist on disk. Re-read and base64 on every AI call (no caching). Only primary display. Capture guarded by an in-progress flag.

## 9. Feature inventory, strengths, weaknesses
| Feature | Status |
|---|---|
| Transparent always-on-top overlay + capture exclusion | works (Win/mac), no click-through |
| Hotkey-driven control incl. emergency hide, stealth fade | works, hardcoded in config |
| Dual-source live STT (AssemblyAI) | works on Windows; mac host audio unsupported |
| 4 documented + Insights AI actions, per-message AI on/off, char budget | works |
| Multi-key Gemini failover, model/lang pickers | works |
| Ollama local provider | present, undocumented |
| OCR-augmented screenshots | works, English only |
| Mobile companion | works, unauthenticated |
| Portable build disguised as Chrome | present |
| Tests | one file |

**Works well:** per-message context toggles + budgeted bundle (good UX for control/cost); per-source STT with buffer merge; key rotation; thoughtful no-focus show (`showInactive`), unresponsive recovery, emergency hide; OCR as cheap text grounding alongside images.

**Weaknesses / risks**
- Security: LAN server with zero auth on 0.0.0.0; plaintext API keys on disk and sent to renderer; webSecurity off, certificate errors ignored, sandbox off, insecure content allowed (app loads only local files, but flags are gratuitous); `.env` bundled into build; file protocol handler overridden naively (path handling is unsanitised).
- Privacy: full-screen captures of everything on the desktop (incl. notifications, other apps) sent to Google; all meeting audio sent to AssemblyAI; third-party participants not informed; screenshots sit unencrypted on disk.
- Stealth marketing / ethics: designed to be undetectable in interviews/meetings; masquerades as Google Chrome (name, publisher, icon, appId) and as a system process; README adds a one-line "use only where allowed" disclaimer that contradicts the rest. Brand impersonation and likely policy violations for users. Content protection is also not undetectable (proctoring tools, process lists, window enumeration, hardware capture, and stealth at 0.02 opacity still exist).
- Bugs/reliability: README and .env.example disagree on screenshot delay; mac host audio not handled; "first screen" source may not be the active monitor; naive downsample (no anti-alias filter beyond averaging); Alt+Shift hotkeys collide with OS shortcuts; error classification by substring (401 in any text triggers key rotation); 6 s min spacing stalls actions; rate/day limits are per-instance estimates; daily token cap is local guesswork; main/renderer both hold state copies (transcript in renderer, history in Gemini service) so they can diverge; legacy code and logs committed; very large renderer file; almost no tests.

## Stealth / "undetectable" claims in README/package (paraphrased)
- Tagline frames it as an open-source alternative to Cluely and ParakeetAI, a "real-time AI interview assistant" with a winking emoji.
- package.json description: invisible AI assistant for meetings that is undetectable during screen share; package name is "stealth-meeting-assistant".
- README: content protection on by default to hide window from capture; "stealth" screenshots and folders (`.stealth_screenshots`); start-hidden/background mode; cursor shape never changes so viewers cannot infer actions; mobile companion for "discreet control" without touching the desktop.
- Build docs: title "Chrome Disguised Executable"; product "Google Chrome (2)", publisher "Google LLC", Chrome icon; process renamed to look like an idle system process.
- Only hedge: "use it only where recording, transcription, screenshots and AI are allowed".

## 10. REUSE MATRIX (licence = none; nothing is copy-able)
| Item | Verdict | Note |
|---|---|---|
| Transparent always-on-top overlay concept, no-focus show, all-workspaces on mac | idea / clean-room | Standard Electron APIs, documented upstream; write from Electron docs, not this file |
| Capture exclusion via content protection | idea (clean-room if wanted) | One Electron call; for Careerloom only useful as privacy (hide from screen share), NOT to conceal use. Decide product stance first |
| Chrome/system-process disguise, fake publisher, stealth opacity, cursor trick | skip | Impersonation, ethics, store/AV/legal risk; contradicts vendor-neutral, honest positioning |
| Global hotkeys list | idea | Pick our own keys; avoid Alt+Shift (IME clash) |
| Emergency hide / unresponsive recovery | idea / clean-room | Small, generic |
| Per-message AI on/off + newest-first char budget bundle | idea, clean-room | Strong UX pattern for interview copilot; rewrite |
| Four-action split (full answer / screen only / speakable suggestion / notes) with distinct context slices | idea | Mirrors our pre-screen/evaluate-style task split; write our own prompts |
| Multi-key failover with rotate-on-quota and restore start index | idea, clean-room | Tiny logic; add typed error codes instead of substring matching |
| Dual-source STT: separate sockets for mic and system, label by source, merge finals in a short window | idea, clean-room | Good, cheap; note no real diarisation |
| System audio via desktop-capture getUserMedia | idea | Windows-only path; for mac need ScreenCaptureKit/virtual device; research separately |
| AssemblyAI streaming v3 integration | clean-room from vendor docs | Use official docs, not this repo |
| OCR with tesseract.js to ground screenshots | clean-room | Generic; consider macOS Vision OCR instead for speed on 16 GB Mac |
| Screenshot FIFO cap + cleanup | idea, clean-room | Add crash-recovery sweep and encrypt/temp dir |
| Mobile companion over LAN WS | skip for now; if wanted, clean-room with pairing token, TLS or localhost tunnel, allow-list | As shipped it is an open door |
| Plaintext key file | skip | Use OS keychain (Electron safeStorage); Careerloom already has settings patterns |
| Disabled web security / ignore cert errors flags | skip | Never |
| Ollama provider | skip | We already have local/opencode/zen runners |
| Code, prompts, UI copy, icons | skip | Copyright; do not vendor or paraphrase closely |

**Action:** if we want anything beyond "ideas", open an issue/DM asking the authors to add a permissive licence (MIT/Apache-2.0). Until a licence is granted, treat this repo as reference-only; log it in THIRD_PARTY_NOTICES as "not used" to avoid future ambiguity (like the VoiceStudio AGPL lesson).
