# S-E1 — echo test (WP5): NOT RUN on hardware; deferred to the user's Mac

**Why not run:** this Mac's default input *and* output are a Bluetooth speaker (Bose Revolve+ II; mic over HFP) with the built-in speakers/mic as non-defaults. A meaningful speakers-and-mic echo test needs a controlled acoustic setup, audible playback in the user's room and switching system audio devices (changes the user's settings), and `echoCancellation` on/off can only be measured through `getUserMedia` inside Electron. An agent also cannot judge transcription leak without running Whisper alongside (one-model rule). None of that is safe or conclusive unattended.

**What is built instead (so G-E can be decided on the user's hardware in minutes):**
- `electron/copilot/echo-gate.ts`: half-duplex gate (`speaking` → 350 ms `tail` → `listening`) drops mic frames in `speakers` mode, so the expected default holds without VAD barge-in: **`speakers` ⇒ half-duplex only (gate G-E recommendation: yes, as planned)**; push-to-interrupt cancels TTS; headphone barge-in (≥ 300 ms and ≥ 2 words) only when `echo:'headphones'`; text-echo filter (≥ 0.8 token overlap with the last two spoken sentences, ≥ 4 tokens) as the safety net for any leak that gets through the tail.
- `micLeaks(rmsDuringTone, rmsBaseline)`: the self-test verdict (tone RMS ≥ max(0.01 FS, 3× baseline) ⇒ "Your mic is picking up the speakers…"), thresholds are a first guess to be tuned from the user's run (marked `ponytail:`).
- Renderer queue plays PCM through `AudioContext` (no `<audio>`, no CSP change).

**To close the spike (user, ~5 min):** with speakers (not headphones) run the Practice self-test at `echoCancellation` true and false; record `micLeaks` inputs, and whether Whisper transcribes the interviewer's voice with the gate off. If leak is audible at the 350 ms tail, raise `tailMs` (config clamps exist) rather than enabling VAD barge-in in speakers mode.
