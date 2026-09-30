// Runs the mic while a session is armed/listening (plan §3.1): frames go to main over `copilotAudio`; main owns the state,
// the silent-source detector and the kill switch, so this hook only opens and closes the device.
import { useEffect } from 'react'

import type { AudioChunkMsg } from '../../electron/contract'
import type { MicHandle } from './capture/mic'

type Start = (o: { deviceId?: string | null; onFrame: (pcm16: ArrayBuffer) => void }) => Promise<MicHandle>
const defaultStart: Start = async o => (await import('./capture/mic')).startMic(o)

export function useMicCapture(o: { active: boolean; sessionId: string | null; deviceId: string | null; send(m: AudioChunkMsg): void; start?: Start; onError?(message: string): void }): void {
  const { active, sessionId, deviceId, send, start = defaultStart, onError } = o
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let handle: MicHandle | null = null
    const t0 = Date.now()
    start({ deviceId, onFrame: pcm16 => { if (!cancelled) send({ source: 'mic', pcm16, t: Date.now() - t0 }) } })
      .then(h => { if (cancelled) h.stop(); else handle = h })
      .catch((e: unknown) => onError?.(e instanceof Error ? e.message : String(e)))
    return () => { cancelled = true; handle?.stop() }
    // send/start/onError are stable callers; a new session or device restarts the capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sessionId, deviceId])
}
