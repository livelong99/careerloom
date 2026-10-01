# D - TTS options for the AI-interviewer voice (research, 2026-10-01)

Tags: **V** = read at the cited URL via fetch. **V-s** = only seen in a web-search summary or third-party page at that URL (treat as probable, re-check before building). **INF** = my inference. **UNV** = not verified this session (recalled or unknown).
Caveat: the fetch tool returns model-summarised pages, so exact price tables are partly V-s. Re-open vendor pricing pages before committing.

Cost basis (INF): 30 min of speech at ~150 wpm = 4,500 words, about 27,000 characters (~6 chars/word incl. spaces). "Per hour" below = cost of one 1-hour mock session where the agent speaks ~30 min.

## 1. Zero-install OS voices

| Item | Finding | Tag / URL |
|---|---|---|
| macOS `say` | `say 'text' -o file` writes a file; `--file-format='?'` and `--data-format='?'` list formats. Works from Electron main via `child_process.spawn('say', ['-v', voice, '-r', wpm, '-o', tmp, '--data-format=LEI16@22050', text])`, then play the file (afplay, or decode in renderer). | V-s https://ss64.com/mac/say.html |
| `say` and Siri voices | `say` / public speech APIs cannot use the neural Siri voices; third-party `say2` reaches them through a private Apple framework. Needs macOS 15.6+, Apple silicon, Xcode 26+, a Siri voice pre-installed, ~320 ms leading silence per render, private API (can break on any OS update). **Do not depend on it.** | V https://github.com/CaptainCodeAU/say2 ; V-s https://medium.com/@fonto.design/how-to-generate-a-text-to-speech-audio-file-in-macos-with-ai-siri-voice-13230c810969 |
| Premium / Enhanced voices | Whether the user has downloaded "Enhanced/Premium" voices in System Settings and whether `say -v` lists them: not confirmed from a primary source. | UNV (check `say -v '?'` on the target Mac) |
| AVSpeechSynthesizer / Personal Voice | Needs Swift/ObjC. Calling it from Electron without native deps means a tiny prebuilt helper binary, which breaks "no native deps". Personal Voice (AVSpeechSynthesizer authorisation flow) not verified. | UNV; INF that `say` is the zero-native route |
| Chromium `speechSynthesis` | On macOS Chromium queries NSSpeechSynthesizer; on Windows it uses SAPI + OneCore. | V-s https://github.com/electron/electron/pull/14070 (Windows voices fix merged Feb 2019) and the Chromium/Electron search results |
| Electron `getVoices()` empty | Known recurring bug: issue #22844 "returns an empty array" (reported on Ubuntu, Electron 8; closed Aug 2020); #11585 "only native voice" (Windows, closed 2018); #586 "No voices" (2014). Standard workaround: listen for `voiceschanged`, retry with a limit. Chrome has no speech synthesis on Linux. A Chromium report "Speech Synthesis not working on update 130" exists but its page needs sign-in, so unread. | V https://github.com/electron/electron/issues/22844 ; V-s https://github.com/electron/electron/issues?q=speechSynthesis+getVoices ; https://issues.chromium.org/issues/374263394 (UNV) |
| Windows SAPI / OneCore | Chromium exposes SAPI and OneCore voices (INF: Windows "Natural" narrator voices are likely not exposed to Chromium; UNV). Alternative from main: spawn `powershell` with `System.Speech.Synthesis.SpeechSynthesizer` writing a WAV. | V-s (search summary); the PowerShell route is UNV |
| Quality / accents | OS voices are robotic compared with neural options. INF: fine as offline fallback, weak as an "interviewer". No streaming from an LLM; you must chunk by sentence yourself. | INF |

## 2. Cloud TTS

Price per 27k chars (30 min of speech). All dollars are for the 30-min session.

| Provider / model | List price | Cost / session | Streaming + first-audio latency | ToS / notes |
|---|---|---|---|---|
| OpenAI gpt-4o-mini-tts | $0.60/M text-in tokens + $12/M audio-out tokens, vendor estimate ~$0.015/min. 13 voices, `instructions` param for accent/tone/speed. | ~$0.45 | Chunked streaming; docs recommend `wav`/`pcm`. Coval board (via Gradium page) lists it as "unsuitable for real-time", P95 3,927 ms. No vendor TTFB published. | Must clearly disclose to users that the voice is AI-generated (V). "Interview" use not restricted in what I read. |
| OpenAI tts-1 / tts-1-hd | UNV this session (recall: $15 / $30 per 1M chars, would be $0.41 / $0.81). | UNV | legacy models "latency/quality tradeoffs" (V) | same disclosure rule |
| ElevenLabs Flash/Turbo | $0.04 per 1K chars API (V) | ~$1.08 | Flash v2.5 "~75 ms" excl. network (V); WebSocket streaming (V); 32 languages; 40k char/request. | Higher models: v3 $0.08/1K = ~$2.16; v4 listed $0.08 (promo $0.022 until Oct 12) (V). Starter plan $6/mo, 272,727 chars = ~10 such sessions (V). ToS not read: UNV. Indian-English voices via voice library: UNV. |
| Google Cloud TTS | Standard/WaveNet $4/M; Neural2 $16/M; Chirp 3 HD $30/M (V-s). Free: 4M chars/mo Standard+WaveNet, 1M each Neural2/Studio/Chirp 3 HD (V-s). | $0.11 / $0.43 / $0.81 | Streaming supported (V-s). No TTFB number found. | `en-IN` voices exist in the catalogue: UNV. Pricing page fetch did not return numbers; only V-s. |
| Azure Speech | Neural $16/M; Neural HD $22/M (cut from $30 in Mar 2026) (V-s). Free F0: 0.5M chars/mo (V). | $0.43 / $0.59 | Text-streaming over websocket v2 designed for LLM token input (V). Docs publish no TTFB target, only how to measure (V). | `en-IN` neural voices exist: UNV. Sources: https://texttolab.com/blog/azure-text-to-speech-pricing , https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency |
| Amazon Polly | Standard $4/M, Neural $16/M, Long-form $100/M, Generative $30/M; free tier first 12 months (V https://aws.amazon.com/polly/pricing/) | $0.11 / $0.43 / $2.70 / $0.81 | Bidirectional streaming (Generative engine) takes LLM tokens, flush at sentence end; 39% faster overall than SynthesizeSpeech (V). Third party says Generative adds 150-300 ms (V-s, https://creativeminds.dev/blog/voice-integration-amazon-connect-bedrock-polly-streaming-latency/). | Polly Kajal en-IN: UNV |
| Deepgram Aura | Aura-1 $0.015/1K; Aura-2 $0.030/1K (V https://deepgram.com/pricing) | $0.41 / $0.81 | Aura-2 vendor: steady-state TTFB ~90 ms, p95 <200 ms (V-s https://deepgram.com/learn/engineering-real-time-low-latency-voice-ai-at-scale); other vendor page says 184 ms. | English-only focus: UNV |
| Cartesia Sonic 3.x | Credits: Free 20K (~27 min), Pro $5/100K (~133 min), Startup $49/1.25M (~1,667 min), Scale $299/8M (V https://cartesia.ai/pricing) | INF ~$1.1 at Pro rate ($5/133 min x 30) | Vendor model-side TTFA 90 ms (Turbo 40 ms), real-world incl. network ~166-190 ms (V-s https://invideo.io/blog/cartesia-sonic-ai-voice/ and https://www.eesel.ai/blog/cartesia-sonic-3-api). Current model sonic-3.6 (V https://docs.cartesia.ai/build-with-cartesia/tts-models/latest). Hinglish/Hindi supported (V). | ToS: UNV |
| OpenRouter (already in the app) | `/api/v1/audio/speech`, OpenAI-compatible; output `mp3` or `pcm` (pcm = lower latency); docs advise splitting long text to cut initial latency (V https://openrouter.ai/docs/guides/overview/multimodal/tts) | see below | Not documented as true streaming; no latency published | one key, no new vendor account |

OpenRouter TTS catalogue (V https://openrouter.ai/collections/text-to-speech-models), session cost for 27k chars:

| Model | Price | Cost / session |
|---|---|---|
| Kokoro 82M (hexgrad) | $0.62/M chars | ~$0.017 |
| Voxtral Mini TTS (Mistral) | $16/M chars | ~$0.43 |
| MAI-Voice-2-Flash (Microsoft AI) | $15/M chars | ~$0.41 |
| MAI-Voice-2 | $22/M chars | ~$0.59 |
| Deepgram Aura-2 | $30/M chars | ~$0.81 |
| Grok Voice TTS 1.0 | $15/M chars | ~$0.41 |
| Gemini 3.8 Flash TTS | $0.50/M in, $9/M out tokens | UNV (token-priced; no chars estimate) |
| Flux TTS (Deepgram), Fish S2.1 Pro Free | Free | $0 (INF: rate-limited, can disappear) |
| No OpenAI TTS listed | | |

Observation (INF): every credible cloud option except ElevenLabs/Cartesia lands at roughly $0.4-0.8 per session. OpenRouter's Kokoro is ~25x cheaper than the rest.

## 3. Local neural (sidecar, installed on demand like Whisper)

| Model | Licence | Size / RAM | Apple-Silicon speed | Streaming | English / Indian English | Notes |
|---|---|---|---|---|---|---|
| **Kokoro-82M** | Apache-2.0 (V https://huggingface.co/hexgrad/Kokoro-82M) | 82M params; kokoro-onnx ~300 MB, ~80 MB quantised (V https://github.com/thewh1teagle/kokoro-onnx; library MIT) | "near real-time on M1" (V); search: 12-79x real-time on M1/M2 class, Core ML build ~2x faster than mlx-audio (V-s https://huggingface.co/mattmireles/kokoro-coreml) | Chunk-by-sentence is trivial because it is so fast; mlx-audio streams (V https://github.com/Blaizzy/mlx-audio) | v1.0: 8 languages, 54 voices, American + British English (V). No en-IN voice that I could confirm: UNV. | Best size/quality ratio; also on OpenRouter at $0.62/M, so a cloud fallback shares the same voices. |
| Piper | **GPL-3.0** in the maintained repo OHF-Voice/piper1-gpl ("looking for maintainers") (V https://github.com/OHF-Voice/piper1-gpl); original rhasspy/piper went read-only Oct 2025 and was MIT (V-s, codesota/localaimaster pages). Voice repo labelled MIT (V https://huggingface.co/rhasspy/piper-voices) but docs say check each voice's MODEL_CARD, some voices restrictive, "personal use and research" wording (V https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md). | A medium voice ~tens of MB (V-s) | RTF ~0.008 on desktop CPU (V-s https://localaimaster.com/blog/piper-tts-setup-guide) | CLI/HTTP, easy per-sentence | en_US + en_GB listed; **no en_IN** (V) | GPL is fine as a spawned separate process but legal review needed before shipping the binary; voice licences are per-voice. Lower naturalness than Kokoro (INF). |
| Supertonic (3) | OpenRAIL-M models, MIT sample code (V-s https://supertonic3.github.io/ , https://huggingface.co/Supertone/supertonic) | ~66-99M params (sources differ: HF says 66M, blog says 99M for v3) | M4 Pro CPU RTF 0.012-0.015 (V HF) | Not stated (V) | preset voices M1.. etc.; accents UNV | Very fast; OpenRAIL-M carries use restrictions to read. |
| NeuTTS Air / Nano | Air Apache-2.0; Nano/2E "NeuTTS Open License 1.0" (V https://github.com/neuphonic/neutts) | Air 748M total / ~360M active, Q4 400-600 MB RAM, Q8 ~800 MB (V-s MarkTechPost); Nano ~120M | CPU-only on M4 iMac: 111 tok/s (Air), 195 tok/s (Nano) (V) | yes, GGUF via llama-cpp-python (V) | en/es/de/fr; English accents not specified (V) | Voice cloning from reference clip; extra Python/llama.cpp stack. |
| Chatterbox / Turbo | MIT (V-s https://www.resemble.ai/learn/models/chatterbox-turbo) | Turbo 350M params (V-s) | "6x real-time, ~75 ms" is GPU (V-s); MLX fp16 port exists (mlx-community/chatterbox-turbo-fp16); Mac numbers UNV | MLX via mlx-audio (V) | cloning-based; accents depend on reference clip | Heavier; expressive. Need a measured test on a 16 GB Mac. |
| Orpheus 3B | Apache-2.0 (V-s) | 3B; Q4_K_M GGUF ~2.5 GB (V-s https://codersera.com/blog/install-and-run-orpheus-3b-tts-on-macos-a-complete-guide/) | ~200 ms streaming latency claimed on GPU; on Mac only via GGUF/LM Studio (V-s) | yes | English | Too heavy to share a 16 GB Mac with Whisper + browser (INF). |
| Sesame CSM-1B | Apache-2.0 (V https://github.com/SesameAILabs/csm) | 1B | CUDA-tested; MPS possible but not guaranteed; mlx-audio lists a CSM variant (V) | not documented | English | Not a fit for a default (INF). |
| F5-TTS | code MIT, **pretrained weights CC-BY-NC** (V https://github.com/SWivid/F5-TTS) | - | RTF 0.04 on L20 GPU (V) | - | cloning | Non-commercial weights: reject. |

## 4. Recommendation

**DEFAULT: Kokoro-82M, ONNX int8, installed on demand as a sidecar (same pattern as the Whisper MLX sidecar).**
- Why: Apache-2.0 (V), ~80 MB quantised (V), faster than real-time on M1 (V), American + British voices (V), clean per-sentence streaming from the LLM (INF), nothing bundled in the installer. Same voices are also reachable on OpenRouter for $0.62/M chars (~$0.02 per session, V) as a no-install fallback using the key the app already holds.
- Zero-install fallback below it: macOS `say -o` + afplay (V-s). Windows via `speechSynthesis` or PowerShell SAPI (UNV). Use only until Kokoro is installed; voices are robotic.
- Published first-audio: none vendor-published for Kokoro. INF: tens to a few hundred ms per sentence on Apple silicon given 12-79x real time (V-s). **Measure on the target Mac before promising.**
- Gap: no confirmed Indian-English voice in Kokoro or Piper. If an Indian accent matters, it needs a cloud voice (Azure, Google, Polly, Cartesia Hinglish) - voice availability UNV for each.

**PREMIUM: Cartesia Sonic (sonic-3.6) as the lowest published first-audio, with ElevenLabs Flash v2.5 as the alternative.**
- Cartesia: vendor TTFA 90 ms (Turbo 40 ms), ~166-190 ms with network (V-s). ~$1.1/session at Pro rate (INF), Free tier ~27 min/mo.
- ElevenLabs Flash: ~75 ms excluding network (V), WebSocket streaming (V), $1.08/session list price (V).
- Cheaper premium-ish cloud: Azure Neural HD ($0.59/session, WebSocket v2 text-streaming built for LLM tokens, V) or Polly Generative bidirectional streaming ($0.81, V). Both have en-IN regional voices to confirm (UNV).
- Not recommended as premium: OpenAI gpt-4o-mini-tts. Best `instructions` control and ~$0.45/session, but the only latency evidence I found is a Coval p95 of 3.9 s (V Gradium page), plus mandatory AI-voice disclosure (V).

Benchmark caveat (V): Coval changed its TTFA definition on 3 Jun 2026 to include leading silence, so older "ms" comparisons are not comparable to newer ones. Vendor TTFB claims exclude network and cold connections (V-s).

## 5. Integration notes for Electron (INF)
- Sentence-level pipeline: LLM stream -> sentence splitter -> TTS call per sentence -> queue of PCM chunks into one `AudioContext` in the renderer (plays gaplessly, supports barge-in cancel). Same shape works for Kokoro (local HTTP/stdin), OpenRouter (`pcm`), Cartesia/ElevenLabs (WebSocket).
- Provider interface returns 24 kHz mono PCM chunks; voice/speed/accent are settings per provider.
- Pre-connect websockets (Azure doc says pre-connecting and reusing the synthesizer removes handshake latency, V https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency).
- Keep keys in the existing key manager; show an AI-voice disclosure in the UI (required by OpenAI, V; harmless elsewhere).

## 6. Open items (UNV)
1. Exact current Cartesia/ElevenLabs/OpenAI ToS wording for interview-practice use.
2. `say -v '?'` on a Mac with Enhanced/Premium voices installed; Windows OneCore voices through Electron 43.
3. Kokoro first-chunk latency and RAM on the user's 16 GB Mac next to Whisper (measure).
4. Whether any Indian-English voice exists in Kokoro (hf_ Hindi voices?) or Piper; confirm en-IN voices at Azure, Google, Polly.
5. tts-1 / tts-1-hd current prices; Google/Azure/Polly price pages re-read at source.
