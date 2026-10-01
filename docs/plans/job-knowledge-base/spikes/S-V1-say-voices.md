# S-V1 — macOS `say` en_IN voices (WP5)

Dev Mac (16 GB, Apple Silicon), `say -v <voice> --file-format=WAVE --data-format=LEI16@24000 -o x.wav "<text>"`, 24 kHz mono PCM16 out (confirmed with `afinfo`).
`say -v '?'` lists en_IN: **Aman, Rishi, Tara** (plus a Siri-labelled duplicate row for Aman/Tara; same voice id).

## Render latency (wall clock, includes process spawn), sentence "Tell me about a time you disagreed with a teammate." (52 chars), n=5, warm
| Voice | runs (s) | p50 | max |
|---|---|---|---|
| Rishi | 0.63 0.60 0.69 0.81 0.84 | 0.69 | 0.84 |
| Tara | 0.81 0.77 0.84 0.80 0.87 | 0.81 | 0.87 |
| Aman | 1.41 0.79 0.95 1.01 0.89 | 0.95 | 1.41 |
| Samantha (en_US ref) | 1.05 1.13 0.97 1.29 0.97 | 1.05 | 1.29 |

Cold first call: Aman 3.5 s, Rishi 2.1 s, Tara 1.8 s (voice asset load). Long sentence (120 chars): Aman 3.3 s, Rishi 1.9 s, Tara 1.5 s (cold). Latency is per call, not streaming: the whole sentence renders before any audio exists.

## Findings
- Plan §6.6 estimate (1.0–1.7 s/sentence) holds for cold/long; warm short sentences are 0.6–1.0 s. First audio of the session is therefore ≥ 0.7 s even warm ⇒ **pre-render the opening question at session start** and keep one throwaway warm-up render ("Hello") on engine init to pay the cold cost off the critical path.
- Rishi is fastest, Tara close; Aman slowest. Default en_IN order for the voice picker: **Rishi → Tara → Aman** (latency); the user can pick any.
- Quality by ear could not be judged by an agent (no listening). **Needs the user's ear** — wav samples are rendered by `scripts/tts-latency.mjs --engine system --out <dir>`; picker labels voices by name only, no quality claims.
- Sentence-sized calls are the unit; N+1 prefetch hides latency for any sentence longer than the previous one's audio duration (a 52-char sentence ≈ 3.5 s of audio vs ≈ 0.8 s render ⇒ ample margin).
