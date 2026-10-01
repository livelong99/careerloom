// Kokoro ONNX sidecar engine: one long-lived Python process, JSON lines in, framed PCM16 out (kokoro-script.ts). Stops after an idle window (plan §10 RAM budget).
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { VoiceInfo } from '../kb/types'
import { assertMemory } from '../prescreen-model'
import type { Pcm, TtsEngine } from './adapter'
import { findKokoro, type KokoroRuntime } from './install'

const MAX_FRAME = 8 << 20
const IDLE_MS = 60_000
const VOICES: Array<[string, string, string]> = [['af_heart', 'Heart (US, F)', 'en_US'], ['af_bella', 'Bella (US, F)', 'en_US'], ['am_michael', 'Michael (US, M)', 'en_US'], ['bf_emma', 'Emma (UK, F)', 'en_GB'], ['bm_george', 'George (UK, M)', 'en_GB']]

/** `<u32 id><u32 nbytes><payload>` frames from stdout, tolerant of any chunking. */
export function createFrameParser(onFrame: (id: number, data: Buffer) => void) {
  let buf: Buffer = Buffer.alloc(0)
  return {
    push(chunk: Buffer) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
      while (buf.length >= 8) {
        const id = buf.readUInt32LE(0); const n = buf.readUInt32LE(4)
        if (n > MAX_FRAME) throw new Error(`Kokoro frame too large (${n} bytes)`)
        if (buf.length < 8 + n) return
        const data = Buffer.from(buf.subarray(8, 8 + n)); buf = buf.subarray(8 + n)
        onFrame(id, data)
      }
    },
  }
}

type Proc = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'stderr' | 'kill' | 'on'>
export type KokoroDeps = { find?: () => KokoroRuntime | null; spawn?: (rt: KokoroRuntime) => Proc; checkMemory?: () => Promise<void>; idleMs?: number }
type Req = { push: (d: Buffer | null) => void; fail: (e: Error) => void }

export type KokoroEngine = TtsEngine & { stop(): void }

export function createKokoroEngine(d: KokoroDeps = {}): KokoroEngine {
  const find = d.find ?? (() => findKokoro())
  const spawn = d.spawn ?? ((rt: KokoroRuntime) => nodeSpawn(rt.python, [rt.script, rt.model, rt.voices], { stdio: ['pipe', 'pipe', 'pipe'] }) as ChildProcessWithoutNullStreams)
  const checkMemory = d.checkMemory ?? assertMemory
  const idleMs = d.idleMs ?? IDLE_MS
  let proc: Proc | null = null
  let ready: Promise<void> | null = null
  let nextId = 1
  let tail: Promise<unknown> = Promise.resolve() // requests run one at a time: one heavy process, one render
  let idle: ReturnType<typeof setTimeout> | null = null
  const reqs = new Map<number, Req>()

  const stop = () => {
    if (idle) clearTimeout(idle); idle = null
    const p = proc; proc = null; ready = null
    p?.kill()
    for (const r of reqs.values()) r.fail(new Error('Kokoro process stopped'))
    reqs.clear()
  }
  const touch = () => { if (idle) clearTimeout(idle); idle = setTimeout(stop, idleMs); (idle as { unref?: () => void }).unref?.() }

  async function ensure(rt: KokoroRuntime): Promise<Proc> {
    if (proc && ready) { await ready; return proc }
    await checkMemory()
    const p = spawn(rt); proc = p
    let resolveReady!: () => void; let rejectReady!: (e: Error) => void
    ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej })
    ready.catch(() => {})
    const parser = createFrameParser((id, data) => {
      if (id === 0) { if (JSON.parse(data.toString('utf8')).ready) resolveReady(); return }
      const r = reqs.get(id)
      if (!r) return // late frames of an aborted request
      r.push(data.length ? data : null)
    })
    p.stdout.on('data', (c: Buffer) => { try { parser.push(c) } catch (e) { stop(); rejectReady(e as Error) } })
    p.stderr.on('data', () => { /* model/phonemizer chatter; never logged (may echo text) */ })
    p.on('exit', code => {
      if (proc === p) { proc = null; ready = null; if (idle) clearTimeout(idle); idle = null }
      const err = new Error(`Kokoro process exited (${code ?? 'signal'})`)
      rejectReady(err); for (const r of reqs.values()) r.fail(err); reqs.clear()
    })
    p.on('error', e => { rejectReady(e); for (const r of reqs.values()) r.fail(e) })
    await ready
    return p
  }

  return {
    id: 'kokoro', stop,
    async voices(): Promise<VoiceInfo[]> {
      const installed = !!find()
      return VOICES.map(([id, name, lang]) => ({ engine: 'kokoro', id, name, lang, offline: true, installed, sizeMb: installed ? null : 115, note: installed ? null : 'Install from Settings → Local models' }))
    },
    async *synth(text, voiceId, speed, signal): AsyncGenerator<Pcm> {
      const rt = find()
      if (!rt) throw new Error('Kokoro voice is not installed: install it in Settings → Local models')
      const turn = tail; let release!: () => void
      tail = new Promise<void>(r => { release = r })
      await turn.catch(() => {})
      const id = nextId++
      try {
        if (signal.aborted) return
        const p = await ensure(rt)
        if (idle) { clearTimeout(idle); idle = null }
        const q: Array<Buffer | null | Error> = []; let wake: (() => void) | null = null
        const post = (x: Buffer | null | Error) => { q.push(x); wake?.(); wake = null }
        reqs.set(id, { push: x => post(x), fail: e => post(e) })
        signal.addEventListener('abort', () => post(null), { once: true })
        p.stdin.write(JSON.stringify({ id, text, voice: voiceId, speed }) + '\n')
        for (;;) {
          while (!q.length) await new Promise<void>(r => { wake = r })
          const x = q.shift() as Buffer | null | Error
          if (x instanceof Error) throw x
          if (x === null || signal.aborted) return
          const even = x.length - (x.length % 2)
          yield { pcm16: x.buffer.slice(x.byteOffset, x.byteOffset + even) as ArrayBuffer, sampleRate: 24000 as const }
        }
      } finally { reqs.delete(id); release(); if (proc) touch() }
    },
  }
}
