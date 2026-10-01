// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSystemEngine, parseSayVoices, wavToPcm } from './say'

const LIST = `Aman (English (India)) en_IN    # Hello! My name is Aman.
Eddy (English (US))  en_US    # Hello! My name is Eddy.
Rishi (English (India)) en_IN    # Hello! My name is Rishi.
Amelie (French (Canada)) fr_CA    # Bonjour
Tara (English (India)) en_IN    # Hello! My name is Tara.
Daniel (English (UK)) en_GB    # Hello! My name is Daniel.`

const wav = (samples: number[], extra = false) => {
  const pcm = Buffer.alloc(samples.length * 2); samples.forEach((s, i) => pcm.writeInt16LE(s, i * 2))
  const fmt = Buffer.alloc(24); fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(24000, 12); fmt.writeUInt32LE(48000, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22)
  const junk = extra ? Buffer.concat([Buffer.from('FLLR'), Buffer.from([4, 0, 0, 0]), Buffer.alloc(4)]) : Buffer.alloc(0)
  const data = Buffer.concat([Buffer.from('data'), Buffer.from([pcm.length, 0, 0, 0]), pcm])
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, junk, data])
  return Buffer.concat([Buffer.from('RIFF'), Buffer.from([body.length, 0, 0, 0]), body])
}

describe('parseSayVoices', () => {
  it('keeps English voices, en_IN first (stable, then other English by name)', () => {
    const v = parseSayVoices(LIST)
    expect(v.map(x => x.name)).toEqual(['Aman', 'Rishi', 'Tara', 'Daniel', 'Eddy'])
    expect(v[0]).toMatchObject({ engine: 'system', id: 'Aman (English (India))', lang: 'en_IN', offline: true, installed: true })
  })
  it('ignores junk lines', () => { expect(parseSayVoices('\nnonsense\n')).toEqual([]) })
})

describe('wavToPcm', () => {
  it('extracts the data chunk (skipping extra chunks)', () => {
    expect([...new Int16Array(wavToPcm(wav([1, -2, 3], true)))]).toEqual([1, -2, 3])
  })
  it('rejects wrong format', () => {
    const b = wav([1]); b.writeUInt32LE(44100, 24)
    expect(() => wavToPcm(b)).toThrow(/24000/)
    expect(() => wavToPcm(Buffer.from('nope'))).toThrow()
  })
})

describe('system engine', () => {
  it('invokes say with voice, rate and output file; yields 24 kHz PCM; cleans up', async () => {
    const calls: string[][] = []
    const removed: string[] = []
    const eng = createSystemEngine({
      platform: 'darwin',
      exec: async (args, _s) => { calls.push(args); return args[0] === '-v' && args[1] === '?' ? LIST : '' },
      readWav: async () => wav([5, 6, 7, 8]), tmp: () => '/tmp/x.wav', rm: async p => { removed.push(p) },
    })
    const chunks: ArrayBuffer[] = []
    for await (const c of eng.synth('Hello there', 'Rishi (English (India))', 1.2, new AbortController().signal)) chunks.push(c.pcm16)
    expect([...new Int16Array(chunks[0])]).toEqual([5, 6, 7, 8])
    expect(calls[0]).toEqual(['-v', 'Rishi (English (India))', '-r', '210', '--file-format=WAVE', '--data-format=LEI16@24000', '-o', '/tmp/x.wav', '--', 'Hello there'])
    expect(removed).toEqual(['/tmp/x.wav'])
  })
  it('text starting with "-" cannot become a say flag (-- guard)', async () => {
    const calls: string[][] = []
    const eng = createSystemEngine({ platform: 'darwin', exec: async a => { calls.push(a); return '' }, readWav: async () => wav([1]), tmp: () => '/t', rm: async () => {} })
    for await (const _ of eng.synth('-o /etc/passwd', 'Aman', 1, new AbortController().signal)) { /* drain */ }
    expect(calls[0].slice(-2)).toEqual(['--', '-o /etc/passwd'])
  })
  it('speed is clamped to a sane say rate', async () => {
    const calls: string[][] = []
    const eng = createSystemEngine({ platform: 'darwin', exec: async a => { calls.push(a); return '' }, readWav: async () => wav([1]), tmp: () => '/t', rm: async () => {} })
    for await (const _ of eng.synth('x y z', 'Aman', 9, new AbortController().signal)) { /* drain */ }
    expect(calls[0][calls[0].indexOf('-r') + 1]).toBe('350')
  })
  it('not on darwin: no voices, synth throws a clear error', async () => {
    const eng = createSystemEngine({ platform: 'win32' })
    expect(await eng.voices()).toEqual([])
    await expect((async () => { for await (const _ of eng.synth('x', 'v', 1, new AbortController().signal)) { /* */ } })()).rejects.toThrow(/macOS/)
  })
  it('an aborted signal produces no audio', async () => {
    const ac = new AbortController(); ac.abort()
    const eng = createSystemEngine({ platform: 'darwin', exec: async () => '', readWav: async () => wav([1]), tmp: () => '/t', rm: async () => {} })
    const out: unknown[] = []
    for await (const c of eng.synth('x y z', 'Aman', 1, ac.signal)) out.push(c)
    expect(out).toEqual([])
  })
})
