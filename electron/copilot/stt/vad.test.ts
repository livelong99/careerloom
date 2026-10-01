import { describe, expect, it } from 'vitest'

import { concat, frames, hiss, silence, tone } from './pcm-gen.test-util'
import { createVad } from './vad'

const run = (pcm: Int16Array) => { const v = createVad(); return frames(pcm).map(f => v.isVoiced(f)) }

describe('vad', () => {
  it('digital silence is never voiced', () => {
    expect(run(silence(2000)).some(Boolean)).toBe(false)
  })
  it('a tone after silence is voiced, silence after the tone is not', () => {
    const r = run(concat(silence(1000), tone(1000), silence(1000)))
    expect(r.slice(0, 10).some(Boolean)).toBe(false)
    expect(r.slice(10, 20).every(Boolean)).toBe(true)
    expect(r.slice(21).some(Boolean)).toBe(false)
  })
  it('steady low noise is not speech, and speech over it is', () => {
    const noise = hiss(6000, 150)
    const r = run(concat(noise, tone(1000, 6000), hiss(2000, 150, 7)))
    expect(r.slice(0, 60).filter(Boolean).length).toBeLessThanOrEqual(1) // floor adapts within a frame or two
    expect(r.slice(60, 70).filter(Boolean).length).toBeGreaterThanOrEqual(9)
    expect(r.slice(72).some(Boolean)).toBe(false)
  })
  it('speech from the very first frame is voiced (no leading silence to learn a floor from)', () => {
    const r = run(concat(tone(2000, 8000), silence(1000)))
    expect(r.slice(0, 20).every(Boolean)).toBe(true)
    expect(r.slice(21).some(Boolean)).toBe(false)
  })
  it('re-arms after a long loud stretch (noise floor does not stick high)', () => {
    const r = run(concat(tone(6000), silence(3000), tone(1000)))
    expect(r.slice(70, 90).some(Boolean)).toBe(false) // silence after the long tone is recognised as silence
    expect(r.slice(90).filter(Boolean).length).toBeGreaterThanOrEqual(9)
  })
})
