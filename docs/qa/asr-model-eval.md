# Speech-to-text models on this Mac: Whisper small vs Parakeet v3 vs Nemotron 3.5 ASR (2026-10-09)

Apple M4, 16 GB, one model loaded at a time. Harness: `~/asr-eval` (not in the repo): real speech from LibriSpeech
test-clean / test-other (40 clips each, every 7th utterance of the first shard) and AMI meeting speech (40 head-mic
clips of 4–30 s), plus 20 synthetic interview lines with heavy tech vocabulary in four macOS voices (US, UK, AU,
Indian English). WER after Whisper's English normaliser. RTF = decode time / audio time (lower is faster).

## Accuracy and speed (whole-utterance decode, as the app's chunker uses them)

| model · runtime | LS clean | LS other | AMI | jargon US | jargon UK | jargon AU | jargon IN | RTF |
|---|---|---|---|---|---|---|---|---|
| Whisper small · MLX (macOS default) | 3.5 % | 7.7 % | 16.3 % | 5.1 % | 4.9 % | 7.3 % | 19.4 % | 0.044–0.059 |
| **Parakeet TDT 0.6B v3** · int8 ONNX, CPU (Windows default) | **2.0 %** | **5.9 %** | **12.5 %** | 6.1 % | 6.1 % | **3.7 %** | **16.3 %** | **0.024–0.038** |
| Nemotron 3.5 ASR · Transformers, Apple GPU, `en-US` | 3.6 % | 7.8 % | 14.8 % | 13.3 % | 8.5 % | 12.2 % | 26.5 % | 0.046–0.075 |
| Nemotron 3.5 ASR · same, language `auto` | 3.7 % | 7.6 % | 14.3 % | 14.3 % | 8.5 % | 12.2 % | 33.7 % | 0.046 |
| Nemotron 3.5 ASR · CPU (6 clips per set) | 3.5 % | 5.6 % | 9.5 % | 13.3 % | 8.5 % | 12.2 % | 26.5 % | 0.10–0.27 |

- Parakeet v3 is the most accurate on every real-speech set and the fastest, on the CPU alone.
- Nemotron 3.5 matches Whisper small on real speech and is clearly weaker on interview jargon (company and tool names:
  "Flipgart", "RGO CD", "post GRSQL") and on the Indian-English voice. None of the three has word boosting, so the
  vocabulary correction in the app matters for all of them.
- A fixed language beats auto-detect on Nemotron, most of all on Indian English (26.5 % vs 33.7 %).

## Nemotron 3.5 streaming (its headline feature), paced in real time

Cache-aware streaming through Transformers 5.19 on the Apple GPU, 4 clips per set (indicative only). Latency = end of
speech → last word of the final text, with audio continuing (silence) after the speech, as it does live.

| chunk (lookahead) | LS clean | AMI | jargon IN | end of speech → last word, p50 / p95 |
|---|---|---|---|---|
| 80 ms (0) | 5.0 % | 14.3 % | 30.9 % | 328 / 361 ms |
| 320 ms (3) | 3.8 % | 9.5 % | 33.3 % | 653 / 839 ms |
| 560 ms (6) | 5.0 % | 11.9 % | 29.6 % | 1,197 / 1,313 ms |
| 1,120 ms (13) | 5.0 % | 8.3 % | 29.6 % | 2,136 / 2,476 ms |

- Text arrives while the speaker is still talking; the final word lands about one chunk after they stop.
- At 80 ms chunks Transformers on the Apple GPU only just keeps up with real time (RTF ≈ 1.0 unpaced): per-chunk
  overhead dominates. 320 ms is the practical floor here.
- The first harness dropped the final partial chunk (the Transformers streaming example does), which hid up to 1.1 s of
  tail audio and made larger chunks look worse. Padding the tail with silence fixed it; the numbers above are after the fix.

## The app's new `hf` engine with the real model

`electron/copilot/stt/hf-script.ts` driven over its stdin framing with real audio (`~/asr-eval/hftest/drive.py`), the
packages at the pins in `runtime.ts` (transformers 5.19.0, torch 2.14.1, huggingface_hub 2.2.0, soundfile 0.14.0,
numpy 2.5.3): `fetch` at commit `ea30d66d…` downloaded only the allowed files, `selftest` passed on `mps`, `serve`
decoded 14 clips (LibriSpeech, AMI, jargon) at **8.6 % WER, median 245 ms per chunk**.

Found and fixed in that run: the Transformers ASR pipeline drops the language for Nemotron and falls back to auto-detect
(and to a 320 ms right context). The sidecar now decodes prompt-conditioned models through their processor with the
chosen language and the widest right context (it decodes whole chunks, so the wider context costs nothing): WER 9.7 % →
8.6 %, decode 289 → 245 ms.

## Recommendation

- Keep Parakeet v3 as the Windows default and consider it for macOS too: more accurate than Whisper small on real speech
  and faster, CPU only, 640 MB. Whisper small stays ahead only on the US-voice jargon line.
- Offer Nemotron 3.5 through the `hf` engine (one click in Local models), not as a default. It is the right pick for
  interviews in another language (hi-IN 6.8–8.1 % on FLEURS per its model card) or code-switching, and the model to
  build native streaming partials on later (speculative answers start while the question is still being asked).
- Not measured: Windows, CUDA, real noisy calls, accents beyond the four TTS voices, the `hf` installer's own pip run
  (the pins were resolved together in the harness venv), multilingual WER.

Sources: model card `huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b` (OpenMDW-1.1, chunk sizes, FLEURS tables);
Transformers docs `model_doc/nemotron3_5_asr` (streaming API, `set_num_lookahead_tokens`, language prompt).
