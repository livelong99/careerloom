// Test-only PCM generators (16 kHz mono PCM16): tone = stand-in for speech, hiss = seeded noise.
export const tone = (ms: number, amp = 8000, hz = 220): Int16Array =>
  Int16Array.from({ length: (16 * ms) | 0 }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * hz * i) / 16000)))
export const hiss = (ms: number, amp = 200, seed = 1): Int16Array => {
  let s = seed
  return Int16Array.from({ length: (16 * ms) | 0 }, () => { s = (s * 1664525 + 1013904223) >>> 0; return Math.round(((s / 2 ** 32) * 2 - 1) * amp) })
}
export const silence = (ms: number): Int16Array => new Int16Array((16 * ms) | 0)
export const concat = (...parts: Int16Array[]): Int16Array => {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
/** 100 ms frames, like the capture worklet. */
export const frames = (pcm: Int16Array, ms = 100): Int16Array[] => {
  const n = 16 * ms, out: Int16Array[] = []
  for (let o = 0; o < pcm.length; o += n) out.push(pcm.subarray(o, o + n))
  return out
}
