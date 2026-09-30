import { describe, expect, it } from 'vitest'

import { buildFixture, parseWav16k } from './bench-fixture'
import { tone } from './pcm-gen.test-util'

function wav(pcm: Int16Array, rate = 16000, extra = true): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const fmt = Buffer.alloc(24); fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE(rate * 2, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22)
  const junk = extra ? Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from([1, 2, 3, 0])]) : Buffer.alloc(0) // odd-sized chunk + pad byte
  const head = Buffer.alloc(12); head.write('RIFF', 0); head.writeUInt32LE(4 + fmt.length + junk.length + 8 + data.length, 4); head.write('WAVE', 8)
  const dh = Buffer.alloc(8); dh.write('data', 0); dh.writeUInt32LE(data.length, 4)
  return Buffer.concat([head, fmt, junk, dh, data])
}

describe('parseWav16k', () => {
  it('reads PCM16 mono 16 kHz past other chunks', () => {
    const pcm = tone(100)
    expect(Array.from(parseWav16k(wav(pcm)))).toEqual(Array.from(pcm))
  })
  it('rejects other formats instead of decoding garbage', () => {
    expect(() => parseWav16k(wav(tone(100), 44100))).toThrow(/16 kHz/)
    expect(() => parseWav16k(Buffer.from('nope'))).toThrow(/WAV/)
  })
})

describe('buildFixture', () => {
  it('concatenates utterances with a silent tail, records each end time and the reference text', () => {
    const f = buildFixture(() => wav(tone(1000)), ['one two', 'three'], 1600)
    expect(f.utterances).toEqual([{ text: 'one two', endMs: 1000 }, { text: 'three', endMs: 3600 }])
    expect(f.pcm.length).toBe(16 * 5200)
    expect(f.refText).toBe('one two three')
  })
})
