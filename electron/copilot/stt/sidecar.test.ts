import { describe, expect, it } from 'vitest'

import type { SttEvent } from './adapter'
import { decodeFrames, FRAME } from './framing'
import { createSidecarAdapter, type SidecarChild } from './sidecar'

function makeChild() {
  const written: Buffer[] = []
  let data: (b: Buffer) => void = () => {}, exit: (c: number | null) => void = () => {}
  let killed = false
  const child: SidecarChild = { write: b => void written.push(b), onData: cb => { data = cb }, onExit: cb => { exit = cb }, kill: () => { killed = true } }
  return { child, written, say: (o: object) => data(Buffer.from(JSON.stringify(o) + '\n')), die: (c = 1) => exit(c), get killed() { return killed } }
}
const frames = (bs: Buffer[]) => decodeFrames(Buffer.concat(bs)).frames
const opts = { source: 'mic' as const, language: 'en', vocab: [], endSilenceMs: 700 }
const tick = () => new Promise(r => setTimeout(r, 0))

describe('sidecar adapter', () => {
  it('sends config, waits for ready, forwards pcm, maps events', async () => {
    const c = makeChild()
    const a = createSidecarAdapter({ id: 'moonshine', spawn: () => c.child, config: o => ({ language: o.language }) })
    const seen: Array<[string, string]> = []
    for (const ev of ['partial', 'final', 'endOfTurn'] as const) a.on(ev, (e: SttEvent) => seen.push([ev, e.text]))
    const started = a.start(opts)
    c.say({ ev: 'ready' })
    await started
    a.push(new Int16Array(4).buffer)
    c.say({ ev: 'partial', text: 'hi', t0: 0, t1: 1 }); c.say({ ev: 'final', text: 'hi there', t0: 0, t1: 2 }); c.say({ ev: 'endOfTurn' })
    expect(seen).toEqual([['partial', 'hi'], ['final', 'hi there'], ['endOfTurn', '']])
    expect(frames(c.written).map(f => f.type)).toEqual([FRAME.config, FRAME.pcm])
    expect(JSON.parse(frames(c.written)[0]!.payload.toString())).toEqual({ language: 'en' })
  })

  it('buffers audio that arrives before ready and replays it', async () => {
    const c = makeChild()
    const a = createSidecarAdapter({ id: 'moonshine', spawn: () => c.child, config: () => ({}) })
    const p = a.start(opts)
    a.push(new Int16Array(2).buffer)
    expect(frames(c.written).map(f => f.type)).toEqual([FRAME.config])
    c.say({ ev: 'ready' }); await p
    a.push(new Int16Array(2).buffer)
    expect(frames(c.written).filter(f => f.type === FRAME.pcm)).toHaveLength(1) // the early chunk stays in the ring only
  })

  it('restarts once after a crash and replays the ring; a second crash closes', async () => {
    const kids = [makeChild(), makeChild()]
    let n = 0
    const a = createSidecarAdapter({ id: 'moonshine', spawn: () => kids[n++]!.child, config: () => ({}) })
    const errs: SttEvent[] = []; let closed = 0
    a.on('error', e => errs.push(e)); a.on('closed', () => closed++)
    const p = a.start(opts); kids[0]!.say({ ev: 'ready' }); await p
    a.push(new Int16Array(8).buffer); a.push(new Int16Array(8).buffer)
    kids[0]!.die(1)
    await tick()
    expect(errs[0]).toMatchObject({ retrying: true })
    kids[1]!.say({ ev: 'ready' }); await tick()
    expect(frames(kids[1]!.written).map(f => f.type)).toEqual([FRAME.config, FRAME.pcm, FRAME.pcm])
    kids[1]!.die(1); await tick()
    expect(errs[1]).toMatchObject({ retrying: false }); expect(closed).toBe(1)
  })

  it('stop kills the child, emits closed once and does not restart', async () => {
    const c = makeChild()
    const a = createSidecarAdapter({ id: 'moonshine', spawn: () => c.child, config: () => ({}), stopGraceMs: 10 })
    let closed = 0; a.on('closed', () => closed++)
    const p = a.start(opts); c.say({ ev: 'ready' }); await p
    await a.stop(); c.die(0); await a.stop(); await tick()
    expect(c.killed).toBe(true); expect(closed).toBe(1)
  })

  it('rejects start when the sidecar never reports ready', async () => {
    const c = makeChild()
    const a = createSidecarAdapter({ id: 'moonshine', spawn: () => c.child, config: () => ({}), readyTimeoutMs: 10 })
    await expect(a.start(opts)).rejects.toThrow(/ready/)
  })

  it('rejects start at once when the child exits before ready', async () => {
    const c = makeChild()
    const a = createSidecarAdapter({ id: 'moonshine', spawn: () => c.child, config: () => ({}), readyTimeoutMs: 5000 })
    const p = a.start(opts); c.die(1)
    await expect(p).rejects.toThrow(/stopped unexpectedly \(exit 1\)/)
  })
})
