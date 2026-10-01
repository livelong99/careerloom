// Request/response decoder over a long-lived python child (Whisper): frames in (config, decode, flush), JSON lines out
// ({ev:'ready'} | {ev:'decoded', id, text} | {ev:'error', id?, message}). One restart after a crash, resending what was
// unanswered (the audio is held here), a second crash rejects everything pending.
import type { SttStartOpts } from './adapter'
import type { Decoder } from './buffer'
import { encodeFrame, FRAME, lineSplitter } from './framing'
import type { SidecarChild } from './sidecar'

export type DecoderSpec = { spawn: () => SidecarChild; config: (o: SttStartOpts) => object; readyTimeoutMs?: number; stopGraceMs?: number; /** Extra fields of the ready line (e.g. the device a sidecar ended up on). */ onReady?: (l: { device?: string; reason?: string }) => void }
type Pending = { frame: Buffer; resolve: (t: string) => void; reject: (e: Error) => void }
type Line = { ev: string; id?: number; text?: string; message?: string; device?: string; reason?: string | null }

export function createSidecarDecoder(spec: DecoderSpec): Decoder {
  const pending = new Map<number, Pending>()
  let child: SidecarChild | null = null, opts: SttStartOpts | null = null, closing = false, restarts = 0, nextId = 1
  let exited: Promise<void> = Promise.resolve()

  function launch(o: SttStartOpts): Promise<void> {
    const c = spec.spawn()
    child = c
    let onReady: () => void = () => {}
    const ready = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Speech model did not become ready')), spec.readyTimeoutMs ?? 120_000)
      onReady = () => { clearTimeout(t); resolve() }
    })
    c.onData(lineSplitter(raw => {
      let l: Line
      try { l = JSON.parse(raw) as Line } catch { return } // ponytail: non-JSON chatter from native libs is ignored
      if (l.ev === 'ready') { spec.onReady?.({ device: l.device, reason: l.reason ?? undefined }); return onReady() }
      const p = l.id === undefined ? undefined : pending.get(l.id)
      if (!p) return
      pending.delete(l.id!)
      if (l.ev === 'decoded') p.resolve((l.text ?? '').trim())
      else p.reject(new Error(l.message ?? 'Speech recognition failed'))
    }))
    exited = new Promise<void>(res => c.onExit(code => { res(); if (child === c && !closing) void crashed(code) }))
    c.write(encodeFrame(FRAME.config, Buffer.from(JSON.stringify(spec.config(o)))))
    return ready
  }

  const current = (): SidecarChild | null => child // TS narrows `child` to null across the awaits below
  const failAll = (msg: string) => { for (const p of pending.values()) p.reject(new Error(msg)); pending.clear() }

  async function crashed(code: number | null) {
    if (restarts >= 1) { child = null; return failAll(`Speech recognition stopped unexpectedly (exit ${code ?? 'signal'})`) }
    restarts++
    try {
      const ready = launch(opts!)
      for (const p of pending.values()) current()?.write(p.frame) // queued behind the config frame; requests made during the restart are already in `pending`
      await ready
    } catch (err) { current()?.kill(); child = null; failAll((err as Error).message) }
  }

  return {
    ready: o => { opts = o; closing = false; restarts = 0; return launch(o) },
    decode(pcm, kind) {
      if (!child) return Promise.reject(new Error('Speech recognition is not running'))
      const id = nextId++
      const head = Buffer.alloc(5)
      head.writeUInt32BE(id, 0); head[4] = kind === 'final' ? 1 : 0
      const frame = encodeFrame(FRAME.decode, Buffer.concat([head, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)]))
      return new Promise<string>((resolve, reject) => { pending.set(id, { frame, resolve, reject }); child!.write(frame) })
    },
    async close() {
      closing = true
      const c = child; child = null
      c?.write(encodeFrame(FRAME.flush, new Uint8Array(0)))
      await Promise.race([exited, new Promise(r => setTimeout(r, spec.stopGraceMs ?? 1500))])
      c?.kill()
      failAll('Speech recognition closed')
    },
  }
}
