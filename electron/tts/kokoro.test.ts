// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFrameParser, createKokoroEngine } from './kokoro'

const frame = (id: number, payload: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32LE(id, 0); h.writeUInt32LE(payload.length, 4); return Buffer.concat([h, payload]) }
const pcm = (...s: number[]) => { const b = Buffer.alloc(s.length * 2); s.forEach((v, i) => b.writeInt16LE(v, i * 2)); return b }

describe('frame parser', () => {
  it('reassembles frames split at arbitrary byte boundaries', () => {
    const got: Array<[number, number[]]> = []
    const p = createFrameParser((id, data) => got.push([id, [...data]]))
    const all = Buffer.concat([frame(1, Buffer.from([1, 2, 3, 4])), frame(1, Buffer.alloc(0)), frame(0, Buffer.from('{"ready":true}'))])
    for (let i = 0; i < all.length; i += 3) p.push(all.subarray(i, i + 3))
    expect(got.map(g => [g[0], g[1].length])).toEqual([[1, 4], [1, 0], [0, 14]])
  })
  it('rejects absurd frame sizes', () => {
    const p = createFrameParser(() => {})
    const h = Buffer.alloc(8); h.writeUInt32LE(1, 0); h.writeUInt32LE(1 << 30, 4)
    expect(() => p.push(h)).toThrow(/frame/)
  })
})

/** A fake sidecar process: replies to JSON lines on stdin with scripted frames. */
function fakeProc(script: (req: { id?: number; op?: string }, out: PassThrough) => void) {
  const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough()
  const ev = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: () => void; killed: boolean; pid: number }
  Object.assign(ev, { stdin, stdout, stderr, killed: false, pid: 1, kill() { ev.killed = true; ev.emit('exit', null) } })
  let buf = ''
  stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) script(JSON.parse(line), stdout) } })
  stdout.write(frame(0, Buffer.from('{"ready":true}')))
  return ev
}
const rt = { python: '/py', script: '/s.py', model: '/m', voices: '/v' }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('kokoro engine', () => {
  it('not installed → voices listed as not installed (picker offers install), synth throws an actionable error', async () => {
    const e = createKokoroEngine({ find: () => null })
    expect((await e.voices()).every(v => !v.installed && v.sizeMb !== null)).toBe(true)
    await expect((async () => { for await (const _ of e.synth('x', 'af_heart', 1, new AbortController().signal)) { /* */ } })()).rejects.toThrow(/not installed/i)
  })
  it('streams frames for the request id and ends on the empty frame; memory is checked before the spawn', async () => {
    const order: string[] = []
    const proc = fakeProc((req, out) => { if (req.id) { out.write(frame(req.id, pcm(1, 2))); out.write(frame(req.id, pcm(3))); out.write(frame(req.id, Buffer.alloc(0))) } })
    const e = createKokoroEngine({ find: () => rt, spawn: () => { order.push('spawn'); return proc as never }, checkMemory: async () => { order.push('mem') } })
    const got: number[][] = []
    for await (const c of e.synth('Hello there', 'af_heart', 1, new AbortController().signal)) got.push([...new Int16Array(c.pcm16)])
    expect(got).toEqual([[1, 2], [3]]); expect(order).toEqual(['mem', 'spawn'])
  })
  it('reuses one process across sentences and serialises concurrent requests', async () => {
    const spawn = vi.fn(() => fakeProc((req, out) => { if (req.id) setTimeout(() => { out.write(frame(req.id!, pcm(req.id!))); out.write(frame(req.id!, Buffer.alloc(0))) }, 10) }) as never)
    const e = createKokoroEngine({ find: () => rt, spawn, checkMemory: async () => {} })
    const run = async (t: string) => { const o: number[] = []; for await (const c of e.synth(t, 'af_heart', 1, new AbortController().signal)) o.push(...new Int16Array(c.pcm16)); return o }
    const [a, b] = [run('first'), run('second')]
    await vi.advanceTimersByTimeAsync(50)
    expect([...(await a), ...(await b)]).toEqual([1, 2])
    expect(spawn).toHaveBeenCalledTimes(1)
  })
  it('abort stops yielding and drops late frames of that request', async () => {
    const proc = fakeProc((req, out) => { if (req.id) setTimeout(() => { out.write(frame(req.id!, pcm(9))); out.write(frame(req.id!, Buffer.alloc(0))) }, 100) })
    const e = createKokoroEngine({ find: () => rt, spawn: () => proc as never, checkMemory: async () => {} })
    const ac = new AbortController(); const got: unknown[] = []
    const p = (async () => { for await (const c of e.synth('abc def', 'af_heart', 1, ac.signal)) got.push(c) })()
    await vi.advanceTimersByTimeAsync(10); ac.abort()
    await vi.advanceTimersByTimeAsync(200); await p
    expect(got).toEqual([])
  })
  it('stops the process after the idle window and respawns on the next use', async () => {
    const procs: Array<ReturnType<typeof fakeProc>> = []
    const spawn = () => { const p = fakeProc((req, out) => { if (req.id) { out.write(frame(req.id, pcm(1))); out.write(frame(req.id, Buffer.alloc(0))) } }); procs.push(p); return p as never }
    const e = createKokoroEngine({ find: () => rt, spawn, checkMemory: async () => {}, idleMs: 60_000 })
    for await (const _ of e.synth('one two', 'af_heart', 1, new AbortController().signal)) { /* */ }
    await vi.advanceTimersByTimeAsync(59_000); expect(procs[0].killed).toBe(false)
    await vi.advanceTimersByTimeAsync(2_000); expect(procs[0].killed).toBe(true)
    for await (const _ of e.synth('two three', 'af_heart', 1, new AbortController().signal)) { /* */ }
    expect(procs.length).toBe(2)
  })
  it('a crashed process fails the in-flight request and the next call respawns', async () => {
    const procs: Array<ReturnType<typeof fakeProc>> = []
    let n = 0
    const spawn = () => { const k = ++n; const p = fakeProc((req, out) => { if (!req.id) return; if (k === 1) { p.emit('exit', 1) } else { out.write(frame(req.id, pcm(7))); out.write(frame(req.id, Buffer.alloc(0))) } }); procs.push(p); return p as never }
    const e = createKokoroEngine({ find: () => rt, spawn, checkMemory: async () => {} })
    await expect((async () => { for await (const _ of e.synth('a b c', 'af_heart', 1, new AbortController().signal)) { /* */ } })()).rejects.toThrow(/exited/)
    const out: number[] = []; for await (const c of e.synth('d e f', 'af_heart', 1, new AbortController().signal)) out.push(...new Int16Array(c.pcm16))
    expect(out).toEqual([7])
  })
  it('stop() kills the process', async () => {
    const proc = fakeProc((req, out) => { if (req.id) { out.write(frame(req.id, pcm(1))); out.write(frame(req.id, Buffer.alloc(0))) } })
    const e = createKokoroEngine({ find: () => rt, spawn: () => proc as never, checkMemory: async () => {} })
    for await (const _ of e.synth('x y', 'af_heart', 1, new AbortController().signal)) { /* */ }
    e.stop(); expect(proc.killed).toBe(true)
  })
})
