// Ported from Open-Cluely (owner's project), adapted for Careerloom: renderer/features/assembly-ai/audio-pipeline.js
// Float32 at the context rate → 16 kHz → fixed 100 ms PCM16 frames.
import { createResampler } from './resample'

export const TARGET_RATE = 16000
export const FRAME_MS = 100

export function toPcm16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i]!)); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff }
  return out
}

export function createPipeline(o: { inRate: number; onFrame: (pcm16: ArrayBuffer) => void; frameMs?: number }) {
  const size = Math.round((TARGET_RATE * (o.frameMs ?? FRAME_MS)) / 1000)
  const resampler = createResampler(o.inRate, TARGET_RATE)
  let pending = new Float32Array(0)
  return {
    write(samples: Float32Array) {
      const r = resampler.process(samples)
      const all = new Float32Array(pending.length + r.length)
      all.set(pending); all.set(r, pending.length)
      let off = 0
      for (; all.length - off >= size; off += size) o.onFrame(toPcm16(all.subarray(off, off + size)).buffer as ArrayBuffer)
      pending = all.slice(off)
    },
  }
}
