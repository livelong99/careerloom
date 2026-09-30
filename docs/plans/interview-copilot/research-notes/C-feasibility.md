# C. Feasibility research: Electron 43 interview copilot (read 2026-10-01)

Repo is on electron ^43.7.0 (package.json). Legend: VERIFIED = read on the cited page/file. INFERENCE = my reasoning. Prices are as read on 2026-10-01 and change.
Note: WebFetch summarises pages with a small model; items marked (summary) came via that and were not seen as raw text.

## 1. Audio capture

### Microphone (VERIFIED)
- systemPreferences.getMediaAccessStatus('microphone'|'camera'|'screen') -> not-determined/granted/denied/restricted/unknown; askForMediaAccess('microphone') is macOS-only, needs NSMicrophoneUsageDescription in Info.plist; a denied request can only be changed in System Settings and needs an app restart. https://raw.githubusercontent.com/electron/electron/v43.7.0/docs/api/system-preferences.md
- Entitlement com.apple.security.device.audio-input is needed under Hardened Runtime (summary, page body was thin): https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input . INFERENCE: standard knowledge; must be in the entitlements plist of the signed build.
- VERIFIED by grep of the repo (2026-10-01): no NSMicrophoneUsageDescription, NSAudioCaptureUsageDescription, audio-input or entitlements anywhere outside node_modules. Installers are built unsigned (CSC_IDENTITY_AUTO_DISCOVERY=false, per project memory), so these must be added (electron-builder mac.extendInfo + entitlements file).

### System / loopback audio
- VERIFIED: session.setDisplayMediaRequestHandler, streams.audio = 'loopback' | 'loopbackWithMute'. The v43.7.0 docs say "Specifying a loopback device will capture system audio, and is currently only supported on Windows." https://raw.githubusercontent.com/electron/electron/v43.7.0/docs/api/session.md (same text on main). useSystemPicker is experimental, macOS 15+ only; when it is used the handler is not invoked.
- VERIFIED, and inconsistent with the line above: desktopCapturer docs describe macOS system audio: macOS 14.2+ needs NSAudioCaptureUsageDescription in Info.plist (run unpackaged from a terminal/IDE and that parent app needs it); since Electron 39.0.0-beta.4 Chromium uses the CoreAudio Tap API by default, no fallback to the old ScreenCaptureKit path; if permission is missing/denied the audio track is created in `ended` state and never delivers samples, with no error to JS; the MacCatapLoopbackAudioForScreenShare flag is removed as of Electron 45 (works in 43). https://raw.githubusercontent.com/electron/electron/main/docs/api/desktop-capturer.md and .../v43.7.0/docs/api/desktop-capturer.md
- VERIFIED: macOS 12.7.6 and earlier cannot capture system audio without a signed kext; macOS 13+ has APIs; workaround is a virtual device (BlackHole, Soundflower) read through getUserMedia. Same desktop-capturer.md.
- VERIFIED known issues (GitHub, both Electron issues, status as fetched):
  - #52738, Electron 43.3.0, macOS 26.5.2 arm64, OPEN: with useSystemPicker:false, 'loopback'/'loopbackWithMute' gives an ended audio track, no TCC prompt. Workaround in the issue: useSystemPicker:true. https://github.com/electron/electron/issues/52738 . This is our exact version and the natural custom-UI code path: a top risk.
  - #49607, Electron 40.1.0, macOS 15.2, CLOSED: getDisplayMedia desktop audio was silent; workaround: video dimensions 4x4 instead of 0x0. https://github.com/electron/electron/issues/49607
- Third-party native-module-free alternative: electron-audio-loopback (claims macOS 12.3+, Windows, Linux, no driver) https://github.com/alectrocute/electron-audio-loopback (only the search snippet read; licence and maintenance NOT verified).
- Windows: loopback via the same API is the documented supported platform (session.md above). Internals (WASAPI) are INFERENCE; not stated on the page.
- Native modules needed? INFERENCE: none for the happy path (getUserMedia + setDisplayMediaRequestHandler). Native only if we bypass Chromium (own CoreAudio tap / ScreenCaptureKit helper binary) or bundle whisper.cpp/sherpa-onnx.
- Screen Recording permission: desktopCapturer docs say screen capture needs user consent on macOS 10.15+ (VERIFIED, same page). Needed for the screenshot path; for audio-only the tap uses the "System Audio Recording" permission (VERIFIED above).
- AudioWorklet 16 kHz PCM: INFERENCE (standard Web Audio): AudioContext({sampleRate:16000}) + AudioWorkletNode posting Int16 frames of 80 ms (1280 samples) to main/WebSocket. Deepgram Flux wants linear16 16 kHz, best in 80 ms chunks (VERIFIED, see 2).
- Two channels: mic stream = candidate, system loopback stream = interviewer. INFERENCE: two separate STT sessions (or one STT per stream) removes diarization need; echo risk if interviewer audio leaks from speakers into the mic (use headphones or AEC).

## 2. STT options (all prices read 2026-10-01)

| Option | Price | Notes / source |
|---|---|---|
| Soniox realtime | $0.12/h ($2/M audio tokens), 60+ languages | https://soniox.com/pricing (summary) |
| AssemblyAI Universal-Streaming (EN/multi) | $0.15/h; U3.6 Pro Realtime $0.45/h; diarization +$0.12/h; billed per WebSocket session duration incl. idle | https://www.assemblyai.com/pricing (summary) |
| Deepgram Nova-3 streaming | $0.0048/min promo (~$0.29/h), regular $0.0077/min; Flux EN $0.0065/min promo | https://deepgram.com/pricing (summary; page says promo rates are limited-time) |
| Deepgram Flux | model-integrated end-of-turn detection, ~260 ms EOT, EagerEndOfTurn event, wss://api.deepgram.com/v2/listen?model=flux-general-en, linear16 16 kHz, 80 ms chunks | https://developers.deepgram.com/docs/flux/quickstart (summary) |
| ElevenLabs Scribe v2 Realtime | $0.39/h, "~150 ms" latency | https://elevenlabs.io/pricing/api (summary) |
| OpenAI live transcription | "$0.017/min" (LOW confidence, summariser mixed old/new models) | https://developers.openai.com/api/docs/pricing |
| Google Chirp 3 streaming | $0.016/min (SECONDARY sources only; Google page fetch was truncated) | search result, e.g. https://convertaudiototext.com/blog/google-cloud-speech-to-text-pricing-2026 |

Local:
- whisper.cpp: MIT (GitHub API), latest release v1.9.4 2026-09-11; Metal/Accelerate/Core ML on Apple Silicon, `stream` example, Silero VAD, tiny ~273 MB to large ~3.9 GB RAM. https://github.com/ggml-org/whisper.cpp (summary) and https://api.github.com/repos/ggml-org/whisper.cpp . Whisper is chunk-based: INFERENCE that streaming latency is worse (~1-3 s rolling) than native streaming models.
- faster-whisper: MIT (GitHub API), Python sidecar (CTranslate2). INFERENCE: CPU on Mac is slower than whisper.cpp Metal; adds Python packaging burden (project already installs a Python model for pre-screen).
- sherpa-onnx: Apache-2.0, v1.13.8 2026-09-10 (GitHub API) https://api.github.com/repos/k2-fsa/sherpa-onnx . Has streaming (online) transducer models and VAD: INFERENCE from prior knowledge; model list page 404'd, NOT verified; npm/Node addon availability NOT verified.
- NVIDIA Parakeet-TDT-0.6B-v3: CC-BY-4.0, 0.6B params, 25 European languages, mean WER 6.32%, RTFx 3333 (GPU); card notes GPU-optimised (Ampere etc.) https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 (summary). INFERENCE: on Mac needs ONNX/MLX/sherpa conversion; not a drop-in.
- Vosk: Apache-2.0 (GitHub API), last push 2026-08-09; INFERENCE: lower accuracy than Whisper-class.
- Apple SpeechAnalyzer/SpeechTranscriber: macOS 26+/iOS 26, on-device, volatile + finalized results, model managed by system (no app-size/memory cost), via AssetInventory https://developer.apple.com/videos/play/wwdc2025/277/ (summary) and search summary. Swift-only API => needs a small native helper binary/addon from Electron (INFERENCE). Accuracy "competitive with Whisper" claims are from blogs (https://whispernotes.app/blog/apple-speech-vs-whisper, marketing, not read). Dev Mac runs Darwin 27 (macOS 27?) so it is available locally.
- Windows speech: NOT researched.
- Speaker separation: prefer two channels (INFERENCE). Diarization fallback costs e.g. AssemblyAI +$0.12/h; whisper.cpp only has tinydiarize (README summary).

## 3. Question detection (all INFERENCE, design advice)
Hybrid, cheapest first:
1. Endpointing from STT (Flux EndOfTurn/EagerEndOfTurn, or ~700-900 ms silence + final transcript) on the interviewer channel only (channel = speaker, so no "is it the interviewer" check).
2. Regex/rules on the turn: trailing "?", openers (what/why/how/tell me/walk me through/describe/explain/design/implement/write/given), imperative "can you ...". Fires in microseconds.
3. Only for ambiguous turns, one tiny LLM/classifier call (same cheap model, max_tokens ~5) returning {question|statement} + type {behavioural, technical, system-design, coding}; type selects prompt template (STAR for behavioural, etc.). Embeddings offer little over rules here (skip at MVP).
4. Speculative start: begin the answer request at the Eager end-of-turn, cancel (AbortController) if speech resumes.

## 4. Answer engine
- Latency targets (INFERENCE): first token < 1.0 s after end-of-turn for a bullet-style suggestion, total < 4 s; STT finalisation ~0.3 s + network + model TTFT.
- Direct HTTPS streaming beats agent CLIs (INFERENCE from how they work: process spawn + tool/agent loop + no token streaming path designed for this; project already has an in-process Zen agent loop `zen-agent.ts` and OpenRouter runner per project memory, so the plumbing exists).
- OpenCode Zen endpoints (VERIFIED, summary): OpenAI/GPT/Grok -> https://opencode.ai/zen/v1/responses ; Claude -> https://opencode.ai/zen/v1/messages ; Gemini -> https://opencode.ai/zen/v1/models/<model-id> ; DeepSeek/MiniMax/GLM/Kimi -> https://opencode.ai/zen/v1/chat/completions . Free models exist; most providers zero-retention, OpenAI 30-day retention, free-trial models may train on data. https://opencode.ai/docs/zen/ . Privacy matters: interview audio/answers are sensitive.
- Anthropic prompt caching (VERIFIED, https://platform.claude.com/docs/en/build-with-claude/prompt-caching): 5-min TTL default, 1h at 2x write; read 0.1x; works with streaming; min cacheable prefix: Haiku 4.5 4096 tokens, Sonnet 5.5 512, Sonnet 5 1024. Consequence: with Haiku the grounding prefix must be >= 4096 tokens or it silently is not cached. Prefix should be [system + resume + JD + notes] then the rolling transcript.
- Local LLM (Ollama/llama.cpp): not fetched. INFERENCE: a 3-8B Q4 model fits 16 GB alongside Electron but TTFT and quality on system-design/coding are weaker; must not run beside a local STT model plus other heavy work (project rule: one heavy model at a time on the 16 GB Mac).

### Per-call pricing (VERIFIED, read 2026-10-01)
- GPT 6 Luna via Zen: $0.10 in / $0.50 out, cached read $0.01, cache write $0.125 per MTok (<=272K) https://opencode.ai/docs/zen/ (summary). Same numbers reported on https://developers.openai.com/api/docs/pricing (summary).
- Gemini 3.5 Flash-Lite: $0.30 in / $2.50 out (context-cache price not seen) https://ai.google.dev/gemini-api/docs/pricing (summary). Gemini 3.5 Flash on Zen $1.50/$9.00.
- Claude Haiku 4.5: $1 / $5, cache read $0.10, 5m write $1.25. Claude Sonnet 5.5: $2 / $10, read $0.20, write $2.50. https://platform.claude.com/docs/en/about-claude/pricing (read as raw text). Note: models 4.7+ use a tokenizer yielding ~30% more tokens for the same text (same page); Sonnet 5.5 is in that family, so its counts below may be ~30% low.

### Cost model (assumptions, INFERENCE)
Per answer call: 5,000 tokens cached prefix (system+resume+JD+notes), 800 uncached input (transcript window + question), 300 output tokens. 15 answered questions in 45 min (one per 3 min, so the 5-min cache stays warm). One cache write per session counted.

| Tier | per call | 15 calls (+1 cache write) | per interview-minute |
|---|---|---|---|
| GPT 6 Luna | $0.00028 | ~$0.005 | ~$0.0001 |
| Gemini 3.5 Flash-Lite (no cache) | $0.0025 | ~$0.037 | ~$0.0008 |
| Haiku 4.5 | $0.0028 | ~$0.049 | ~$0.0011 |
| Sonnet 5.5 | $0.0056 | ~$0.097 | ~$0.0022 |

Arithmetic example, Haiku: 5000*0.10/1e6 + 800*1/1e6 + 300*5/1e6 = 0.0005+0.0008+0.0015 = $0.0028.

## 5. Screenshot / coding-question path
- Capture: desktopCapturer.getSources({types:['screen']}) with thumbnailSize (VERIFIED API exists in desktop-capturer.md; needs Screen Recording consent on macOS 10.15+).
- tesseract.js: licence Apache-2.0, package version 7.0.0 (VERIFIED from https://raw.githubusercontent.com/naptha/tesseract.js/master/package.json). Accuracy on code/monospace: NOT verified; INFERENCE: weak on indentation, symbols, brackets, so poor for code.
- LLM vision: pricing for image tokens NOT fetched. INFERENCE: sending the screenshot to the same multimodal model (Haiku/Sonnet/Gemini) is simpler and better for code than OCR; one image per coding question, a few thousand input tokens, so cents per interview. Recommended MVP: vision, OCR only as offline fallback.
- Hidden-window/screen-share invisibility (contentProtection) not researched here.

## 6. 45-minute interview budget (INFERENCE, using sections 2 and 4)
STT: interviewer channel only = 0.75 h; both channels = 1.5 h.
| STT | interviewer only | both channels |
|---|---|---|
| Soniox $0.12/h | $0.09 | $0.18 |
| AssemblyAI Univ-Streaming $0.15/h (billed per open session) | $0.11 | $0.23 |
| Deepgram Nova-3 $0.29/h promo | $0.22 | $0.43 |
| ElevenLabs $0.39/h | $0.29 | $0.59 |
| OpenAI $0.017/min (low confidence) | $0.77 | $1.53 |
| Google $0.016/min (secondary) | $0.72 | $1.44 |
LLM (Haiku 4.5): ~$0.05. Screenshots: +~$0.02-0.10 (unpriced estimate). Total MVP (Soniox or AssemblyAI + Haiku, interviewer-only): ~$0.15-0.20 per interview; with both channels ~$0.25-0.30. Token volume: ~12k cached-read + ~12k uncached input + ~4.5k output tokens across the session.

## 7. Offline / local-only
- Stack (INFERENCE): whisper.cpp (Metal, small.en or base.en quantised, ~0.5-1 GB RAM) or Apple SpeechAnalyzer (system-managed, free, macOS 26+) + local LLM via Ollama/llama.cpp (3-8B Q4, ~3-6 GB) on 16 GB Apple Silicon. Model RAM figures for whisper from the README summary (tiny ~273 MB, large ~3.9 GB); LLM sizes NOT verified.
- Constraints: 16 GB dev Mac => run one heavy model at a time (project memory); a video call + Electron + STT + LLM concurrently is tight; quality for system design/coding below cloud. Nothing ML bundled in installers (project preference): download models during onboarding.
- Windows local-only: whisper.cpp (Vulkan/CPU) is the portable choice; SpeechAnalyzer is Mac-only.

## Recommendations
1. STT MVP: Soniox ($0.12/h) or AssemblyAI Universal-Streaming ($0.15/h) on two channels; use Deepgram Flux if endpointing quality matters more than price (built-in EOT/EagerEndOfTurn, $0.0065/min promo). Not benchmarked here: accuracy/latency claims are vendor claims. Local-only: Apple SpeechAnalyzer on macOS 26+ (zero cost, private) via a small native helper, else whisper.cpp + Silero VAD.
2. Runner/model: in-process streaming HTTPS (reuse zen/OpenRouter plumbing) not agent CLIs. Default Claude Haiku 4.5 with a >=4096-token cached grounding prefix (or GPT 6 Luna on Zen for ~10x cheaper if quality suffices); "deep" button escalates to Sonnet 5.5 for system-design/coding. Vision model for screenshots, OCR only as fallback.
3. Top risks: (a) macOS system-audio capture in Electron 43 is fragile: docs contradict each other (session.md "Windows only" vs CoreAudio tap on 14.2+), open issue #52738 (custom picker gives silent ended track), silent failure mode, and unsigned builds with no NSAudioCaptureUsageDescription/audio-input entitlement; needs a spike + a BlackHole/native-helper fallback and a "no samples in 3 s" detector. (b) End-to-end latency and false triggers: question detection/endpointing must hit <1 s to first token without answering non-questions; speculative start and cancel needed. (c) Privacy/compliance and cost of sending interview audio/text to cloud providers (OpenAI 30-day retention on Zen, free models may train; some interviews/employers prohibit assistance), plus unsigned app permission UX (TCC prompts tied to app identity).

## NOT verified (explicit)
- Raw text of Soniox, AssemblyAI, Deepgram, ElevenLabs, OpenAI, Gemini, Zen pages: only summariser output. OpenAI STT price low confidence; Google STT price from third-party blogs only; Gemini context-cache price; Zen per-model TTFT.
- Any real latency/accuracy numbers (none measured); Apple SpeechAnalyzer accuracy/latency vs alternatives; sherpa-onnx streaming model list and Node bindings; Vosk/faster-whisper numbers; Windows speech APIs.
- electron-audio-loopback licence/maintenance; whether Electron 43 + macOS 27 behaves like 26.5 in #52738.
- Vision image-token pricing; tesseract.js accuracy on code; Ollama/local LLM speed on 16 GB.
- Whether Anthropic/Zen streaming TTFT meets <1 s (INFERENCE only).
