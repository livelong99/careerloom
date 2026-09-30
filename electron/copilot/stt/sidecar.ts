// Long-lived STT child process (plan §3.2): framed PCM16 in, JSON lines out. One restart per session,
// replaying the last 10 s from the ring; a second crash surfaces as error{retrying:false} + closed.
import { createEmitter, type SttAdapter, type SttEvent, type SttStartOpts } from './adapter'
import { encodeFrame, FRAME } from './framing'
import { PcmRing } from './ring'

export type SidecarChild = {
  write(b: Buffer): void
  onData(cb: (chunk: Buffer) => void): void
  onExit(cb: (code: number | null) => void): void
  kill(): void
}
export type SidecarSpec = {
  id: SttAdapter['id']
  spawn: () => SidecarChild
  /** Sent as the first frame of every (re)start. */
  config: (o: SttStartOpts) => object
  readyTimeoutMs?: number
}

type Line = { ev: string; text?: string; t0?: number; t1?: number; message?: string }
const EMPTY: SttEvent = { text: '', t0: 0, t1: 0 }

export function createSidecarAdapter(spec: SidecarSpec): SttAdapter {
  const { on, emit } = createEmitter()
  const ring = new PcmRing()
  let child: SidecarChild | null = null
  let ready = false, stopping = false, restarts = 0, opts: SttStartOpts | null = null
  let onReady: (() => void) | null = null

  function handle(line: Line) {
    if (line.ev === 'ready') { ready = true; onReady?.(); return }
    const e: SttEvent = { text: line.text ?? '', t0: line.t0 ?? 0, t1: line.t1 ?? 0, message: line.message }
    if (line.ev === 'partial' || line.ev === 'final' || line.ev === 'endOfTurn') emit(line.ev, e)
    else if (line.ev === 'error') emit('error', { ...e, retrying: false })
  }

  function launch(o: SttStartOpts): Promise<void> {
    ready = false
    const c = spec.spawn()
    child = c
    let tail = Buffer.alloc(0)
    c.onData(chunk => {
      tail = Buffer.concat([tail, chunk])
      let nl: number
      while ((nl = tail.indexOf(10)) >= 0) {
        const raw = tail.subarray(0, nl).toString('utf8').trim()
        tail = tail.subarray(nl + 1)
        if (!raw) continue
        try { handle(JSON.parse(raw) as Line) } catch { /* ponytail: non-JSON chatter from native libs is ignored */ }
      }
    })
    c.onExit(code => { if (child === c && !stopping) void crashed(code) })
    c.write(encodeFrame(FRAME.config, Buffer.from(JSON.stringify(spec.config(o)))))
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${spec.id} did not become ready`)), spec.readyTimeoutMs ?? 60_000)
      onReady = () => { clearTimeout(t); resolve() }
    })
  }

  async function crashed(code: number | null) {
    const retry = restarts < 1 && opts
    emit('error', { ...EMPTY, retrying: !!retry, message: `${spec.id} stopped unexpectedly (exit ${code ?? 'signal'})` })
    if (!retry) { child = null; emit('closed', EMPTY); return }
    restarts++
    try {
      await launch(opts!)
      for (const b of ring.snapshot()) child?.write(encodeFrame(FRAME.pcm, new Uint8Array(b)))
    } catch (err) {
      child?.kill(); child = null
      emit('error', { ...EMPTY, retrying: false, message: (err as Error).message })
      emit('closed', EMPTY)
    }
  }

  return {
    id: spec.id,
    on,
    async start(o) { opts = o; stopping = false; restarts = 0; ring.clear(); await launch(o) },
    push(pcm16) {
      ring.push(pcm16)
      if (ready && child) child.write(encodeFrame(FRAME.pcm, new Uint8Array(pcm16)))
    },
    async stop() {
      if (stopping) return
      stopping = true
      const c = child; child = null; ready = false
      c?.write(encodeFrame(FRAME.flush, new Uint8Array(0)))
      c?.kill()
      ring.clear()
      emit('closed', EMPTY)
    },
  }
}

