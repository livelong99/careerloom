import { describe, expect, it } from 'vitest'

import { parseAudioMsg } from './audio-in'

const pcm = (n: number) => new Int16Array(n).buffer

describe('parseAudioMsg (renderer → main audio chunks)', () => {
  it('accepts an ArrayBuffer or a view of PCM16', () => {
    expect(parseAudioMsg({ source: 'mic', pcm16: pcm(1600), t: 5 })?.pcm16.byteLength).toBe(3200)
    const view = new Uint8Array(pcm(800))
    expect(parseAudioMsg({ source: 'system', pcm16: view, t: 1 })?.pcm16.byteLength).toBe(1600)
  })
  it.each([null, 'x', {}, { source: 'cam', pcm16: pcm(10), t: 1 }, { source: 'mic', pcm16: 'nope', t: 1 }, { source: 'mic', pcm16: new ArrayBuffer(3), t: 1 }, { source: 'mic', pcm16: new ArrayBuffer(2_000_000), t: 1 }, { source: 'mic', pcm16: pcm(10), t: 'soon' }])('rejects %j', bad => {
    expect(parseAudioMsg(bad)).toBeNull()
  })
})

describe('gateAudioMsg', () => {
  const pcm = new ArrayBuffer(4)
  it('drops mic frames only while the gate drops', async () => {
    const { gateAudioMsg } = await import('./audio-in')
    expect(gateAudioMsg({ source: 'mic', pcm16: pcm, t: 1 }, { drops: () => true })).toBeNull()
    expect(gateAudioMsg({ source: 'mic', pcm16: pcm, t: 1 }, { drops: () => false })).not.toBeNull()
    expect(gateAudioMsg({ source: 'system', pcm16: pcm, t: 1 }, { drops: () => true })).not.toBeNull()
    expect(gateAudioMsg(null, { drops: () => true })).toBeNull()
  })
})
