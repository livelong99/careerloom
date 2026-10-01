// Runs the mic while a session is armed/listening (plan §3.1): frames go to main over `copilotAudio`; main owns the state,
// the silent-source detector and the kill switch, so this hook only opens and closes the device.
import { useEffect } from 'react'

import type { AudioChunkMsg } from '../../electron/contract'
import type { MicHandle } from './capture/mic'

type Start = (o: { deviceId?: string | null; onFrame: (pcm16: ArrayBuffer) => void; onEnded?: () => void; onFallback?: () => void }) => Promise<MicHandle>
const defaultStart: Start = async o => (await import('./capture/mic')).startMic(o)

const REOPEN_MS = 1000, MAX_REOPEN = 5

export function useMicCapture(o: { active: boolean; sessionId: string | null; deviceId: string | null; send(m: AudioChunkMsg): void; start?: Start; onError?(message: string): void }): void {
  const { active, sessionId, deviceId, send, start = defaultStart, onError } = o
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let handle: MicHandle | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    const t0 = Date.now()
    // The device can vanish mid-session (unplugged headset, Bluetooth drop): release it and reopen, falling back to the default input.
    const reopen = (): void => {
      handle?.stop(); handle = null
      if (cancelled || failures >= MAX_REOPEN) return
      timer = setTimeout(open, REOPEN_MS)
    }
    const open = (): void => {
      start({ deviceId, onFrame: pcm16 => { if (!cancelled) { failures = 0; send({ source: 'mic', pcm16, t: Date.now() - t0 }) } }, onEnded: () => { if (!cancelled) reopen() } })
        .then(h => { if (cancelled) h.stop(); else handle = h })
        .catch((e: unknown) => { onError?.(e instanceof Error ? e.message : String(e)); failures++; reopen() })
    }
    open()
    return () => { cancelled = true; clearTimeout(timer); handle?.stop() }
    // send/start/onError are stable callers; a new session or device restarts the capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionId, deviceId])
}
