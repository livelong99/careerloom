// The overlay's "Open debrief" asks main, main brings this window forward and sends `copilotOpenDebrief`:
// jump to Copilot → Sessions (the newest session is listed first).
import { useEffect } from 'react'

import { gotoPage } from '../components/copilot/selection'
import { navigate } from './nav'

type Subscribe = (name: string, cb: (payload: unknown) => void) => () => void

export function useDebriefLink(): void {
  useEffect(() => {
    const sub = (window.careerloom as { onCopilotEvent?: Subscribe } | undefined)?.onCopilotEvent
    if (!sub) return
    return sub('copilotOpenDebrief', () => {
      gotoPage('sessions') // remembered until the Copilot screen mounts, then taken by it
      navigate('copilot')
    })
  }, [])
}
