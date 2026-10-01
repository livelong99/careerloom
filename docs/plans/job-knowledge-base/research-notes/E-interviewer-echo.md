# E. Interviewer echo / barge-in, mock-interviewer design, live retrieval

Researched 2026-10-01 (web only, no model runs). Tags: VERIFIED = read on the cited page by fetch; REPORTED = appeared only in a search-result snippet or a third-party blog (not independently confirmed); INFERENCE = my reasoning; UNVERIFIED = could not confirm.

## 0. Platform facts

- VERIFIED: Electron 43.0 released 2026-07-02; bundles Chromium 150.0.7871.46, Node v24.17.0, V8 15.0. https://www.electronjs.org/blog/electron-43-0
- VERIFIED: Node PR #57621 "sqlite: enable common flags" enabled FTS5 among the flags; merged 2025-04-04; first in Node 22.16.0; cost ~600 KB binary. https://github.com/nodejs/node/pull/57621
- REPORTED (search snippet): Node 22.13-22.15 and some Node 23 builds had no FTS5 ("node:sqlite compiled without FTS5"). https://github.com/openclaw/openclaw/issues/20987
- INFERENCE: Node 24.17 is newer than 22.16, so `node:sqlite` in Electron 43's main process should have FTS5. Caveat: Electron builds Node itself and could in principle change gyp flags or sqlite. UNVERIFIED for Electron specifically. Cheap check: in the packaged app run `CREATE VIRTUAL TABLE t USING fts5(x)`.
- VERIFIED: the Node sqlite docs page (v26.10 shown) never mentions FTS5, so docs are not proof either way. https://nodejs.org/api/sqlite.html
- VERIFIED: FTS5 has built-in `bm25()` (k1=1.2, b=0.75 hard-coded; lower value = better match; per-column weights). Enabled with `SQLITE_ENABLE_FTS5` at build time. https://www.sqlite.org/fts5.html
- UNVERIFIED: whether `node:sqlite` is still flagged experimental in 24.x (the fetch did not return stability text). Check before depending on it; `better-sqlite3` is the alternative (needs electron-rebuild).

## 1. Echo and barge-in

### 1.1 What Chromium AEC does
- VERIFIED: the `echoCancellation` setting is on the mic input track. It tries to stop speaker sound from entering the mic track. https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/echoCancellation
- VERIFIED: Chrome's software AEC "uses an internal loopback to get the playout audio to cancel". Chrome also has an optional native system AEC on macOS and Windows, chosen with `echoCancellationType` (`browser` or `system`). Read the result with `getSettings()`/`getCapabilities()`. https://developer.chrome.com/blog/more-native-echo-cancellation
- VERIFIED (same page): Chrome said Windows system AEC was not promising and advised against using it at scale. The macOS path was improved to track the actual output device. The older macOS limit was that it could not cancel echo from non-default output devices.
- REPORTED: macOS system echo cancel exists since macOS 10.12. https://developer.chrome.com/blog/more-native-echo-cancellation
- REPORTED (search snippet only): on WebKit/macOS, `echoCancellation` turns on VoiceProcessingIO with advanced ducking, which lowers other audio. Chrome docs say disabling `echoCancellation` also disables audio ducking, on Windows at least. https://groups.google.com/g/discuss-webrtc/c/a1DsB_NKfUg ; https://bugs.webkit.org/show_bug.cgi?id=179411
- INFERENCE: if we ever hit macOS VoiceProcessingIO in Chromium, TTS volume may be ducked. Test on the Mac with echoCancellation on and off.

### 1.2 Does it cancel audio played by the same page?
- VERIFIED (third-party blog): "Chromium does not apply echo cancellation to any remote streams, including WebAudio API streams." Workaround: route Web Audio to `createMediaStreamDestination()`, pass it through a local RTCPeerConnection loopback, and play the result in an `<audio>` element. https://focused.io/lab/echo-cancellation-with-web-audio-api-and-chromium
- REPORTED (single 2026 blog, one author's test): only browser playback paths (`<audio>`, WebRTC receiver tracks) work as the AEC reference. Web Audio custom playback "does not reliably function as a reference". Also: AEC is unconverged at startup, so initial speech is lost; AGC ramp-up adds to it; AEC suppresses the user's near-end speech during double-talk. https://dev.to/orca_forge/browser-voice-interaction-ai-pitfall-guide-2026-16-common-traps-with-aec-getusermedia-and-40hd
- VERIFIED: WebRTC AEC3 operates on 10 ms frames and needs render (playout) and capture frames fed to it. https://chromium.googlesource.com/external/webrtc/+/master/modules/audio_processing/aec3/echo_canceller3.h (headline from search snippet)
- INFERENCE: for local TTS played via `<audio>` or Web Audio in the same renderer, AEC is not something to rely on. The reference path is unclear, and AEC adapts slowly. Treat AEC as a bonus and add app-level gating (1.4).

### 1.3 Electron-specific
- VERIFIED: Electron issue #47043 (Windows 11 ARM64, Electron 37): `echoCancellation:true` worked in Chrome but had no effect in Electron. Closed as not planned; no workaround in the thread. https://github.com/electron/electron/issues/47043
- REPORTED (snippet only): older macOS 10.13.6 issue where AEC did not remove audio the Electron app itself played. https://github.com/electron/electron/issues/14325
- UNVERIFIED: any Electron 43 / Chromium 150 macOS test. No published result found. We must test on the user's Mac.
- REPORTED: Chromium bug that `echoCancellation`/`noiseSuppression` cannot be disabled via constraints in some builds. https://issues.chromium.org/issues/327472528 (title seen in snippet; not opened)

### 1.4 Gating approaches (design options; mostly INFERENCE)
- Half-duplex: ignore mic and VAD while TTS plays, plus a short tail (~200-500 ms is my guess, UNVERIFIED) so room decay is not transcribed. Cheap and robust on speakers. Cost: no barge-in.
- Push-to-interrupt: a key or button stops TTS. It works on speakers with no VAD.
- VAD barge-in on headphones only: no echo path, so VAD speech can cut TTS. Best experience.
- VAD barge-in on speakers: gate by a higher threshold or by a minimum duration or word count. Vapi and Pipecat both do duration/word thresholds (1.5).
- Also, in Web Audio, hold a reference to what is being played and discard STT results that fuzzy-match the TTS text just spoken (INFERENCE; text-echo filter, no source).
- Pre-session "training sound" and disabling AGC reduce startup loss (REPORTED, dev.to link above).

### 1.5 What voice-agent frameworks publish
- LiveKit Agents (VERIFIED, https://docs.livekit.io/agents/build/turns/): five turn detection modes (turn-detector model, realtime models, VAD only, STT endpointing, manual). Agent speech pauses automatically on user audio. Interruption modes: adaptive (separates real interruptions from backchannel) or VAD. Settings include `false_interruption_timeout` and `resume_false_interruption` (agent resumes after a false interruption) and `min_duration`. The page said nothing about AEC.
- Pipecat (VERIFIED, https://docs.pipecat.ai/api-reference/server/utilities/turn-management/user-turn-strategies): start strategies include VAD, transcription, `MinWordsUserTurnStartStrategy`, wake phrase, Krisp VIVA IP (backchannel vs real interruption). Stop strategies include speech timeout (default 0.6 s), turn-analyzer model, external. VAD silence delay default 0.2 s. Min-words applies only while the bot is speaking; with the bot silent it triggers at 1 word. The older `MinWordsInterruptionStrategy` was removed in Pipecat 1.0 (REPORTED, https://docs.pipecat.ai/pipecat/migration/migration-1.0).
- Vapi (VERIFIED, https://docs.vapi.ai/customization/speech-configuration): start-speaking wait default 0.4 s with a smart-endpointing option. Stop-speaking plan: `numWords` (0 = immediate), `voiceSeconds` default 0.2 s, `backoffSeconds` default 1 s. Background-noise default "office" for phone, "off" for web calls. Raise `voiceSeconds` in noisy settings.
- INFERENCE: all three treat echo as an input-side problem (AEC/noise filter/provider) and offer thresholds. None document a built-in answer for TTS leaking into the mic on laptop speakers.

### 1.6 Headphone detection
- VERIFIED: `enumerateDevices()` returns audio input and output devices; `devicechange` fires on changes. https://developer.chrome.com/blog/media-devices
- REPORTED: in Electron the default device can come back with an empty label. https://github.com/electron/electron/issues/4931 (snippet)
- VERIFIED: the W3C Audio Output Devices spec / MDN `setSinkId` select an output, and "audiooutput" does not mean capture of headphones. https://github.com/w3c/mediacapture-main/issues/720
- INFERENCE: no standard "headphones plugged" flag exists. Options: label heuristic (e.g. "Headphones", "AirPods", Bluetooth names) — fragile; a macOS native query (CoreAudio transport type, via a native module or `system_profiler`) — more reliable but extra work; or a user toggle "I'm using headphones" (recommended, simplest). A self-test (play a short tone, measure mic RMS) can detect speaker leakage (INFERENCE).

### 1.7 Autoplay in Electron
- REPORTED: Chromium blocks audio without a user gesture; Electron lets you override with `app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required')`. See also WCAG 1.4.2 in section 2.4. https://thecodersblog.com/play-video-unmuted-in-electron-app/ (snippet). Better path: the session starts from a user click, so no override is needed (INFERENCE).

## 2. AI mock-interviewer design

### 2.1 Context and what products do
- VERIFIED: interviewing.io offers coding, system design, ML and behavioral mocks, and has an AI Interviewer for coding/system design. Human mocks give a written report covering technical accuracy, communication, response to hints, and structure in behavioral rounds, not a numeric rubric. Source is a search summary of third-party reviews, so REPORTED: https://interviewing.io/ ; https://dev.to/alex_hunter_44f4c9ed6671e/is-interviewingio-worth-it-in-2025-an-honest-review-3ne5
- REPORTED: Pramp is peer-to-peer, about 30-45 min per person, roles swap midway, both leave feedback. https://www.pramp.com/faq
- REPORTED: Interview Kickstart mocks use paid FAANG-background coaches; feedback covers coding efficiency, problem solving, system design clarity, communication. https://interviewkickstart.com/mock-interviews-to-nail-your-next-technical-interview
- UNVERIFIED: any published internal rubric from these three. I did not find one.

### 2.2 Academic and vendor LLM interviewer work
- VERIFIED (search summary of arXiv abstract): PolyInterview (arXiv 2607.10310) generates role- and candidate-tailored questions, runs multi-turn spoken interviews with answer-aware follow-ups, and scores content, delivery, non-verbal. Expert ratings: question plans 4.62/5, follow-ups 3.68/5; follow-ups relevant (4.65) but weak on answer dependence (3.28) and diagnostic depth (3.13). https://arxiv.org/abs/2607.10310
- REPORTED: MockLLM (arXiv 2405.18113) uses interviewer/candidate agents over multiple turns. https://arxiv.org/pdf/2405.18113
- REPORTED: LLM-generated follow-ups can match human ones on clarity, relevancy, informativeness, and do better when guided by common mistake types (arXiv 2507.02858, requirements elicitation, not job interviews). https://arxiv.org/pdf/2507.02858
- INFERENCE: weak spot is follow-up depth. Design follow-ups from an explicit checklist per question (missing S/T/A/R element, no metric, "I" vs "we", no trade-off) rather than free generation.

### 2.3 Format design (INFERENCE unless cited)
- Structure: warm-up (1 q) -> core questions (3-5 behavioural, or 1 system design / 1-2 technical) -> candidate questions -> wrap-up and feedback. Time-box each question (e.g. 3-5 min behavioural, 35-45 min system design; Pramp's 30-45 per person is the only cited figure).
- Question selection: draw from the job knowledge base (JD, company, user's stories) and tag by competency; avoid repeats via session history.
- Follow-up probing: at most 2 per question; probe the weakest STAR element; stop when the rubric criteria are covered or time is out.
- Difficulty ramp: start at the user's level, step up after two strong answers, step down after two weak ones; allow user override.
- Formats: behavioural (STAR), technical (problem, hints, complexity), system design (requirements -> estimate -> high-level -> deep dive -> trade-offs). Hint-handling is itself scored (REPORTED from interviewing.io review above).
- Rubric: STAR is a long-standing standard from DDI, 1974 (REPORTED). A 5-point scale anchored to observable behaviour (BARS) is the common structured-interview approach. REPORTED: https://www.aivy.app/en/lexicon/behaviorally-anchored-rating-scales-bars ; https://en.wikipedia.org/wiki/Behaviorally_anchored_rating_scales ; example STAR rubric https://mobilehca.org/wp-content/uploads/2025/10/STAR-Method-Evaluation-Rubric.pdf
- Scoring with an LLM: score each criterion separately with evidence quotes from the transcript, show the evidence, and report ranges not a single number (INFERENCE). Related: LLM scoring of medical OSCE interviews benchmark, arXiv 2501.13957 (REPORTED, https://arxiv.org/pdf/2501.13957; results not read).

### 2.4 Fairness, safety, scope
- This is practice for the user, not hiring. VERIFIED context: NYC Local Law 144 requires a bias audit within one year and notices (10 business days per roundtable materials) for employers/agencies using automated employment decision tools; enforced since 2023-07-05. https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page . INFERENCE: it does not apply to a self-practice tool that makes no employment decision. Do not market scores as predictive of hiring outcomes.
- EEOC: not fetched. UNVERIFIED; omit unless needed.
- VERIFIED: NIST AI RMF 1.0 (2023-01-26) is voluntary, with Govern/Map/Measure/Manage; Generative AI Profile NIST-AI-600-1 released 2024-07-26. https://www.nist.gov/itl/ai-risk-management-framework . Useful as a checklist for documenting limits.
- INFERENCE (design guidance): score only content the user said, not accent, voice, name, or appearance; disclose that scores are rough and not validated; never score protected traits; let the user delete transcripts (aligns with existing retention settings); keep the interviewer from asking illegal or personal questions (age, family, religion) unless the user wants to rehearse handling them; label feedback as AI-generated.

### 2.5 Accessibility (WCAG 2.2)
- VERIFIED SC 1.4.2 Audio Control (A): audio that plays automatically more than 3 s needs a pause/stop or independent volume control. Best practice: start sound from a user action. https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html
- VERIFIED SC 2.2.1 Timing Adjustable (A): time limits imposed by content must be off-able, adjustable to at least 10x, or extendable (with 20 s warning); exceptions for real-time events and essential limits. https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html . INFERENCE: a mock interview timer is arguably "essential" but offering "no time limit / extra time" mode is cheap and safer.
- VERIFIED SC 1.2.2 Captions (Prerecorded) (A); live captions are SC 1.2.4 (AA). https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html . INFERENCE: TTS output is generated live, so show the interviewer's text as a transcript/caption anyway for deaf and hard-of-hearing users and noisy rooms.
- INFERENCE: provide speech-rate control, repeat-question button, text-answer fallback instead of mic, pause/skip, keyboard-operable controls, and a visible "listening / speaking" state. No cited source for rate control; it is a design choice.

## 3. Retrieval on the live-session path

### 3.1 SQLite FTS5 BM25
- VERIFIED: FTS5 ranks with built-in `bm25()`; the doc gives index-size numbers only (743 MiB / 340 MiB / 134 MiB for a 1636 MiB email set by `detail` level), no latency. https://www.sqlite.org/fts5.html
- REPORTED (third-party blogs, hardware unknown): FTS5 on 1.73M patent rows ~3 ms vs 10-30 s LIKE. https://dev.to/soytuber/from-30-seconds-to-3-milliseconds-replacing-like-with-fts5-on-17m-patent-records-2bo7 ; sub-40 ms lookup on a 250 GB DB. https://medium.com/charisol-pulse/how-zstd-compression-and-fts5-turned-a-250gb-sqlite-database-into-a-sub-40ms-lookup-engine-9e83c044752d
- INFERENCE: for a personal KB (thousands of chunks) FTS5 is far under 10 ms; the cost on the live path is dominated by the LLM and STT, not search. Measure on the real index before claiming a number.

### 3.2 Small embedding models on CPU
Model facts (VERIFIED on model cards):
- all-MiniLM-L6-v2: Apache-2.0, 22.7M params, 384-dim, input truncated at 256 word pieces by default. https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- bge-small-en-v1.5: MIT, 33.4M params, 384-dim, 512 tokens, MTEB avg 62.17, retrieval 51.68; query instruction optional with small drop. https://huggingface.co/BAAI/bge-small-en-v1.5
- gte-small: MIT, 33.4M params, 384-dim, 512 tokens, MTEB avg 61.36, English only. https://huggingface.co/thenlper/gte-small

Latency (REPORTED, not verified by me, hardware varies):
- transformers.js MiniLM (q8) on WASM: 12.20 ms median per single short input; batch-8 81 items/s; raw onnxruntime-web 12.05 ms. M2-class laptop per one article. https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/ (snippet) ; benchmark harness https://github.com/huggingface/transformers.js-benchmarking
- One page reports ~7.6 ms at concurrency 1 with ONNX Runtime and no batching (source and hardware not confirmed; I could not locate the exact page). UNVERIFIED.
- UNVERIFIED: no published CPU numbers found for bge-small or gte-small in transformers.js. INFERENCE: expect roughly 1.5x MiniLM-L6 cost, since they have 12 layers vs 6 (layer counts not verified here).
- Superlinked page has only GPU numbers (L4: p50 53 ms), so not usable. https://superlinked.com/glossary/what-is-all-minilm-l6-v2

Recommendation (INFERENCE): embed documents at ingest, not live; only the short query is embedded live (~10-30 ms). Run the embedder in a utility process or worker to keep the UI and audio responsive. Use FTS5 first, embeddings as rerank or fallback.

### 3.3 Pure-JS search libraries
| Lib | Licence | BM25 | Notes |
|---|---|---|---|
| MiniSearch | MIT (VERIFIED) | Scoring appears BM25-like; README shows scores, exact algorithm not confirmed | In-memory, no deps, prefix and fuzzy, add/remove docs. https://github.com/lucaong/minisearch |
| Orama | Apache-2.0 (VERIFIED) | BM25 listed (VERIFIED) | README claims "less than 2kb" and 21 microsecond example query; these are marketing claims, UNVERIFIED for our corpus. Also full-text/vector/hybrid. https://github.com/oramasearch/orama |
| FlexSearch 0.8.2 | Apache-2.0 (VERIFIED) | No native BM25; custom scorer only (VERIFIED) | Bundle 4.5-16.3 KB gzip (VERIFIED); speed claims are vendor benchmarks. https://github.com/nextapps-de/flexsearch |

INFERENCE: if FTS5 works in Electron 43, skip all three (no new dependency, persisted index, real BM25). If FTS5 turns out missing, MiniSearch (MIT, in-memory, rebuild at startup) is the smallest fallback.

## 4. Open items to test on the Mac
1. Play TTS through `<audio>` and through Web Audio with speakers, `echoCancellation` true/false, and record mic: does the STT transcribe the TTS? (Electron 43 / Chromium 150.)
2. Check `getSettings().echoCancellation` and `echoCancellationType` in Electron 43; see whether system AEC is selectable.
3. Check for output ducking with `echoCancellation:true`.
4. `CREATE VIRTUAL TABLE ... USING fts5` inside the packaged Electron 43 app; check `node:sqlite` stability flag.
5. Time FTS5 and a q8 MiniLM/bge-small query on the real KB.
