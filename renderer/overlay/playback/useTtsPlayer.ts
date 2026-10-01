// The overlay plays the interviewer's voice. The player exists from mount but stays silent until `armed`:
// only an AI-interviewer session the user started arms it (no sound before an explicit Start).
import { useEffect, useRef } from 'react'

import { attachTtsPlayer, type TtsPlayerBridge } from './index'

export function useTtsPlayer(armed: boolean): void {
  const player = useRef<ReturnType<typeof attachTtsPlayer> | null>(null)
  useEffect(() => {
    const bridge = window.careerloom as unknown as Partial<TtsPlayerBridge> | undefined
    if (!bridge?.onTtsAudio || !bridge.kbTtsPlayback) return
    const p = attachTtsPlayer(bridge as TtsPlayerBridge)
    player.current = p
    return () => { p.detach(); player.current = null }
  }, [])
  useEffect(() => { if (armed) player.current?.arm(); else player.current?.disarm() }, [armed])
}
