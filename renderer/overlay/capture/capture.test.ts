import { describe, expect, it } from 'vitest'

import { createPipeline, toPcm16 } from './pipeline'
import { createResampler } from './resample'

const tone = (hz: number, rate: number, secs: number, amp = 0.5) => Float32Array.from({ length: Math.round(rate * secs) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate))
const rms = (x: Float32Array, skip = 200) => Math.sqrt(x.slice(skip, x.length - skip).reduce((a, v) => a + v * v, 0) / (x.length - 2 * skip))

describe('resampler', () => {
  it('48k → 16k keeps a 1 kHz tone at full amplitude and the right length', () => {
    const out = createResampler(48000, 16000).process(tone(1000, 48000, 1))
    expect(Math.abs(out.length - 16000)).toBeLessThan(40)
    expect(rms(out)).toBeGreaterThan(0.5 * Math.SQRT1_2 * 0.97)
    expect(rms(out)).toBeLessThan(0.5 * Math.SQRT1_2 * 1.03)
  })
  it('kills a 10 kHz tone that would alias into the band (>30 dB), unlike averaging', () => {
    const out = createResampler(48000, 16000).process(tone(10000, 48000, 1))
    expect(rms(out)).toBeLessThan(0.5 * Math.SQRT1_2 * 0.03)
  })
  it('gives the same samples whatever the chunking', () => {
    const x = tone(440, 44100, 0.5)
    const whole = createResampler(44100, 16000).process(x)
    const r = createResampler(44100, 16000)
    const parts: number[] = []
    for (let i = 0; i < x.length; i += 333) parts.push(...r.process(x.subarray(i, i + 333)))
    expect(parts.length).toBe(whole.length)
    for (let i = 0; i < whole.length; i++) expect(Math.abs(parts[i]! - whole[i]!)).toBeLessThan(1e-5)
  })
  it('passes through at the same rate', () => {
    const x = tone(300, 16000, 0.1)
    expect(createResampler(16000, 16000).process(x)).toBe(x)
  })
})

describe('pipeline', () => {
  it('emits 100 ms (1600-sample, 3200-byte) PCM16 frames and clamps', () => {
    const frames: ArrayBuffer[] = []
    const p = createPipeline({ inRate: 16000, onFrame: f => frames.push(f) })
    p.write(new Float32Array(2048).fill(2)); p.write(new Float32Array(2048).fill(-2)); p.write(new Float32Array(2048))
    expect(frames).toHaveLength(3) // 6144 samples → 3 frames, 1344 pending
    expect(frames.every(f => f.byteLength === 3200)).toBe(true)
    expect(new Int16Array(frames[0]!)[0]).toBe(0x7fff)
    expect(toPcm16(Float32Array.of(-1, 0, 1))).toEqual(Int16Array.of(-32768, 0, 32767))
  })
  it('48k input still yields 16 kHz frames', () => {
    let n = 0
    const p = createPipeline({ inRate: 48000, onFrame: () => n++ })
    const x = tone(500, 48000, 1)
    for (let i = 0; i < x.length; i += 2048) p.write(x.subarray(i, i + 2048))
    expect(n).toBe(9) // ~1 s → 9-10 frames depending on filter delay
  })
})
