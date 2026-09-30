// Test helper: a scripted CDP endpoint. `handler(method, params)` answers each call; `emit` pushes events.
import type { Socket } from './cdp'

export type Sent = { id: number; method: string; params: Record<string, any>; sessionId?: string }

export function fakeSocket(handler: (method: string, params: Record<string, any>) => unknown = () => ({})) {
  let onMessage: (d: string) => void = () => {}
  let onClose: () => void = () => {}
  const sent: Sent[] = []
  const socket: Socket = {
    send: raw => {
      const m = JSON.parse(raw) as Sent
      sent.push(m)
      let result: unknown
      try { result = handler(m.method, m.params) } catch (e) { return queueMicrotask(() => onMessage(JSON.stringify({ id: m.id, error: { message: (e as Error).message } }))) }
      queueMicrotask(() => onMessage(JSON.stringify({ id: m.id, result })))
    },
    close: () => onClose(),
    onMessage: cb => { onMessage = cb },
    onClose: cb => { onClose = cb },
  }
  return { socket, sent, emit: (method: string, params: Record<string, unknown>, sessionId?: string) => onMessage(JSON.stringify({ method, params, sessionId })), drop: () => onClose() }
}
