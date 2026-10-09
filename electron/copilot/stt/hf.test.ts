import { describe, expect, it, vi } from 'vitest'

import type { SidecarChild } from './sidecar'

const kids: Array<ReturnType<typeof makeChild>> = []
function makeChild() {
  const written: Buffer[] = []
  let data: (b: Buffer) => void = () => {}, exit: (c: number | null) => void = () => {}
  const child: SidecarChild = { write: b => void written.push(b), onData: cb => { data = cb }, onExit: cb => { exit = cb }, kill: () => {} }
  return { child, written, say: (o: object) => data(Buffer.from(JSON.stringify(o) + '\n')), die: (c = 1) => exit(c) }
}
const spawnEnv: Array<NodeJS.ProcessEnv | undefined> = []
vi.mock('./child', () => ({ spawnSidecarChild: (_rt: unknown, env?: NodeJS.ProcessEnv) => { const k = makeChild(); kids.push(k); spawnEnv.push(env); return k.child } }))

import { decodeFrames, FRAME } from './framing'
import { hfAdapter } from './hf'
import { LOOKAHEAD_MS } from './hf-models'
import { NEMOTRON_REPO, STT_NOT_INSTALLED, type SttRuntime } from './runtime'

const SHA = 'c'.repeat(40), ID = `${NEMOTRON_REPO}@${SHA}`
const rt = (models: string[]): SttRuntime => ({ python: '/p', script: '/s.py', cache: '/cache', pin: 'x', models })
const frames = (bs: Buffer[]) => decodeFrames(Buffer.concat(bs)).frames
const OPTS = { source: 'mic' as const, language: 'en', vocab: [], endSilenceMs: 300 }
const pcm = (ms: number, amp: number) => new Int16Array(16 * ms).fill(amp).buffer
const tick = () => new Promise(r => setTimeout(r, 0))

describe('hf adapter', () => {
  it('sends the pinned repo/rev, device, language and look-ahead; offline env; strips language tags from the final text', async () => {
    kids.length = 0; spawnEnv.length = 0
    const a = hfAdapter(ID, 'cuda', { language: 'auto', lookahead: 6 }, rt([ID]))
    const finals: string[] = []
    a.on('final', e => finals.push(e.text))
    const started = a.start(OPTS)
    const k = kids[0]!
    k.say({ ev: 'ready', device: 'cuda' }); await started
    const cfg = JSON.parse(frames(k.written)[0]!.payload.toString())
    expect(cfg).toEqual({ repo: NEMOTRON_REPO, rev: SHA, cache: '/cache', device: 'cuda', language: 'auto', lookahead_ms: LOOKAHEAD_MS[6] })
    expect(spawnEnv[0]).toMatchObject({ HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' })
    // loud speech then silence → the chunker asks the sidecar to decode the utterance
    for (let i = 0; i < 6; i++) a.push(pcm(100, 8000))
    for (let i = 0; i < 12; i++) a.push(pcm(100, 0))
    await tick()
    for (const f of frames(k.written).filter(f => f.type === FRAME.decode)) k.say({ ev: 'decoded', id: f.payload.readUInt32BE(0), text: '<en-US> tell me about yourself' })
    await tick(); await a.stop()
    expect(finals).toEqual(['tell me about yourself'])
  })
  it('device auto/coreml are sent as auto (the sidecar picks MPS, CUDA or CPU)', async () => {
    kids.length = 0
    const a = hfAdapter(ID, 'coreml', undefined, rt([ID]))
    const p = a.start(OPTS); kids[0]!.say({ ev: 'ready' }); await p
    expect(JSON.parse(frames(kids[0]!.written)[0]!.payload.toString())).toMatchObject({ device: 'auto', language: 'en-US', lookahead_ms: 320 })
    await a.stop()
  })
  it('not installed → the install hint; a model id that is not repo@sha is refused at construction', async () => {
    expect(() => hfAdapter('small', 'auto', undefined, rt([]))).toThrow(/Unknown Hugging Face model/)
    expect(() => hfAdapter('acme/asr', 'auto', undefined, rt([]))).toThrow(/Unknown Hugging Face model/)
    const a = hfAdapter(ID, 'auto', undefined, rt(['other/model@' + SHA]))
    await expect(a.start(OPTS)).rejects.toThrow(STT_NOT_INSTALLED)
    await expect(hfAdapter(ID, 'auto', undefined, null).start(OPTS)).rejects.toThrow(STT_NOT_INSTALLED)
  })
})
