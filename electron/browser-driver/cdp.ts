// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket: request/response by id,
// events by name. The socket is injectable so tests run against a scripted fake.
export type Socket = { send(data: string): void; close(): void; onMessage(cb: (data: string) => void): void; onClose(cb: () => void): void }
export type Connect = (url: string) => Promise<Socket>
type Listener = (params: Record<string, any>, sessionId?: string) => void

export const CALL_TIMEOUT_MS = 30_000

// The electron tsconfig has no DOM lib, so the global WebSocket is typed by the few members used here.
type WebSocketLike = { send(d: string): void; close(): void; onopen: (() => void) | null; onerror: (() => void) | null; onclose: (() => void) | null; onmessage: ((e: { data: unknown }) => void) | null }

export const nodeSocket: Connect = url => new Promise((resolve, reject) => {
  const WS = (globalThis as unknown as { WebSocket: new (u: string) => WebSocketLike }).WebSocket
  if (!WS) return reject(new Error('This runtime has no built-in WebSocket'))
  const ws = new WS(url)
  ws.onerror = () => reject(new Error('Couldn\'t connect to the browser\'s debugging port'))
  ws.onopen = () => resolve({
    send: d => ws.send(d),
    close: () => ws.close(),
    onMessage: cb => { ws.onmessage = e => cb(String(e.data)) },
    onClose: cb => { ws.onclose = cb },
  })
})

export class Cdp {
  private next = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  private listeners = new Map<string, Set<Listener>>()
  private closed = false

  constructor(private sock: Socket) {
    sock.onMessage(raw => this.handle(raw))
    sock.onClose(() => this.fail(new Error('The browser closed the debugging connection')))
  }

  send<T = Record<string, any>>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = CALL_TIMEOUT_MS): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The browser connection is closed'))
    const id = this.next++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser call ${method} timed out`)) }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.sock.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  on(event: string, cb: Listener): void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(cb)
    this.listeners.set(event, set)
  }

  close(): void {
    this.fail(new Error('The browser connection is closed'))
    try { this.sock.close() } catch { /* already gone */ }
  }

  private handle(raw: string): void {
    let msg: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: Record<string, any>; sessionId?: string }
    try { msg = JSON.parse(raw) } catch { return }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(msg.error.message ?? 'Browser call failed'))
      else p.resolve(msg.result ?? {})
    } else if (msg.method) {
      for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params ?? {}, msg.sessionId)
    }
  }

  private fail(err: Error): void {
    this.closed = true
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.reject(err); this.pending.delete(id) }
  }
}
