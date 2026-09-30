// Benchmark audio (plan §3.2 "Benchmark on this machine"): a few interview sentences spoken by the macOS system voice,
// generated on demand so no recording ships in the app. SYNTHETIC: cleaner and more regular than a real call.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const BENCH_SENTENCES = [
  'Tell me about a time you led a project under a tight deadline.',
  'How would you design a rate limiter for a public API?',
  'I reduced the p95 latency of our checkout service by forty percent.',
  'Why do you want to join our team?',
]
const GAP_MS = 1600 // silence after each sentence, so every utterance has a clear end of speech

/** Sample data of a PCM16 mono 16 kHz WAV (walks RIFF chunks; `say`/afconvert add extra ones). */
export function parseWav16k(buf: Buffer): Int16Array {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file')
  let fmtOk = false
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), len = buf.readUInt32LE(o + 4), body = o + 8
    if (id === 'fmt ') fmtOk = buf.readUInt16LE(body) === 1 && buf.readUInt16LE(body + 2) === 1 && buf.readUInt32LE(body + 4) === 16000 && buf.readUInt16LE(body + 14) === 16
    if (id === 'data') {
      if (!fmtOk) throw new Error('Benchmark audio must be PCM16 mono 16 kHz')
      const end = Math.min(buf.length, body + len) & ~1
      const out = new Int16Array((end - body) >> 1)
      for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(body + i * 2)
      return out
    }
    o = body + len + (len & 1)
  }
  throw new Error('WAV has no audio data')
}

export type BenchFixture = { pcm: Int16Array; utterances: Array<{ text: string; endMs: number }>; refText: string }

export function buildFixture(tts: (text: string) => Buffer, sentences: string[] = BENCH_SENTENCES, gapMs = GAP_MS): BenchFixture {
  const parts: Int16Array[] = [], utterances: BenchFixture['utterances'] = []
  let ms = 0
  for (const text of sentences) {
    const speech = parseWav16k(tts(text))
    ms += speech.length / 16
    utterances.push({ text, endMs: Math.round(ms) })
    parts.push(speech, new Int16Array(16 * gapMs)); ms += gapMs
  }
  const pcm = new Int16Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { pcm.set(p, o); o += p.length }
  return { pcm, utterances, refText: sentences.join(' ') }
}

/** macOS system voice → 16 kHz mono WAV (Copilot is macOS-only for now). */
export function sayWav(text: string): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-bench-'))
  try {
    const aiff = path.join(dir, 's.aiff'), wav = path.join(dir, 's.wav')
    execFileSync('say', ['-o', aiff, text]); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav])
    return fs.readFileSync(wav)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
