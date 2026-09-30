import { describe, expect, it } from 'vitest'

import { createSidecarDecoder } from './decoder'
import { decodeFrames, FRAME } from './framing'
import type { SidecarChild } from './sidecar'

function makeChild() {
  const written: Buffer[] = []
  let data: (b: Buffer) => void = () => {}, exit: (c: number | null) => void = () => {}
  let killed = false
  const child: SidecarChild = { write: b => void written.push(b), onData: cb => { data = cb }, onExit: cb => { exit = cb }, kill: () => { killed = true } }
  return { child, written, say: (o: object) => data(Buffer.from(JSON.stringify(o) + '\n')), die: (c = 1) => exit(c), get killed() { return killed } }
}
const frames = (bs: Buffer[]) => decodeFrames(Buffer.concat(bs)).frames
const OPTS = { source: 'mic' as const, language: 'en', vocab: ['Kubernetes'], endSilenceMs: 600 }
const tick = () => new Promise(r => setTimeout(r, 0))
/** request frame payload: [id u32 BE][kind u8 (0 partial, 1 final)][pcm16] */
const req = (f: { payload: Buffer }) => ({ id: f.payload.readUInt32BE(0), kind: f.payload[4], samples: (f.payload.length - 5) / 2 })

describe('sidecar decoder', () => {
  it('sends config, waits for ready, answers decode requests by id', async () => {
    const c = makeChild()
    const d = createSidecarDecoder({ spawn: () => c.child, config: o => ({ model: 'small', vocab: o.vocab }) })
    const r = d.ready(OPTS); c.say({ ev: 'ready' }); await r
    const p = d.decode(new Int16Array(160), 'final')
    const [cfg, dec] = frames(c.written)
    expect(cfg!.type).toBe(FRAME.config); expect(JSON.parse(cfg!.payload.toString())).toEqual({ model: 'small', vocab: ['Kubernetes'] })
    expect(dec!.type).toBe(FRAME.decode); expect(req(dec!)).toMatchObject({ kind: 1, samples: 160 })
    c.say({ ev: 'decoded', id: req(dec!).id, text: ' hello ' })
    expect(await p).toBe(' hello '.trim())
  })

  it('keeps concurrent requests apart', async () => {
    const c = makeChild()
    const d = createSidecarDecoder({ spawn: () => c.child, config: () => ({}) })
    const r = d.ready(OPTS); c.say({ ev: 'ready' }); await r
    const a = d.decode(new Int16Array(2), 'partial'), b = d.decode(new Int16Array(2), 'final')
    const [x, y] = frames(c.written).slice(1).map(req)
    c.say({ ev: 'decoded', id: y!.id, text: 'B' }); c.say({ ev: 'decoded', id: x!.id, text: 'A' })
    expect([await a, await b]).toEqual(['A', 'B'])
  })

  it('an error line rejects the request it names', async () => {
    const c = makeChild()
    const d = createSidecarDecoder({ spawn: () => c.child, config: () => ({}) })
    const r = d.ready(OPTS); c.say({ ev: 'ready' }); await r
    const p = d.decode(new Int16Array(2), 'final'); const rejected = expect(p).rejects.toThrow(/bad audio/)
    c.say({ ev: 'error', id: req(frames(c.written)[1]!).id, message: 'bad audio' })
    await rejected
  })

  it('after a crash restarts once and resends the unanswered request; a second crash rejects', async () => {
    const kids = [makeChild(), makeChild()]; let n = 0
    const d = createSidecarDecoder({ spawn: () => kids[n++]!.child, config: () => ({}) })
    const r = d.ready(OPTS); kids[0]!.say({ ev: 'ready' }); await r
    const p = d.decode(new Int16Array(8), 'final')
    kids[0]!.die(1); await tick()
    kids[1]!.say({ ev: 'ready' }); await tick()
    const again = frames(kids[1]!.written)
    expect(again.map(f => f.type)).toEqual([FRAME.config, FRAME.decode])
    kids[1]!.say({ ev: 'decoded', id: req(again[1]!).id, text: 'ok' })
    expect(await p).toBe('ok')
    const q = d.decode(new Int16Array(8), 'final'); const rejected = expect(q).rejects.toThrow(/stopped/)
    kids[1]!.die(1); await rejected
  })

  it('ready rejects when the sidecar never answers; decode before ready is an error; close kills', async () => {
    const c = makeChild()
    const d = createSidecarDecoder({ spawn: () => c.child, config: () => ({}), readyTimeoutMs: 10 })
    await expect(d.decode(new Int16Array(2), 'final')).rejects.toThrow(/not running/)
    await expect(d.ready(OPTS)).rejects.toThrow(/ready/)
    const c2 = makeChild()
    const d2 = createSidecarDecoder({ spawn: () => c2.child, config: () => ({}), stopGraceMs: 5 })
    const r = d2.ready(OPTS); c2.say({ ev: 'ready' }); await r
    await d2.close()
    expect(c2.killed).toBe(true)
    expect(frames(c2.written).at(-1)!.type).toBe(FRAME.flush)
  })
})
