import { LayoutPanelTop, Mic, Play, Square } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import { isNotImplemented } from './api'
import { ConsentGate } from './ConsentGate'
import { gotoPage, useSelection } from './selection'
import { startPractice, stopSession } from './startActions'
import { isRunning, useSessionState } from './useSessionState'

/** Header actions: Preview overlay, Start live session… (opens the consent gate), Start practice; Stop while a session runs. */
export function CopilotActions() {
  const [gate, setGate] = useState(false)
  const s = useSessionState()
  const { jobId } = useSelection()
  const running = isRunning(s)
  const preview = (): void => { void careerloom.copilotOverlay({ passive: false }).then((r: unknown) => { if (isNotImplemented(r)) showToast('The overlay is not available in this build yet') }, () => showToast('Could not open the overlay', 'error')) }
  return (
    <div className="flex items-center gap-2">
      {running && <Badge variant={s.mode === 'live' ? 'danger' : 'brand'}>{s.mode === 'live' ? 'Listening' : 'Practising'}</Badge>}
      {running ? <Button size="sm" variant="destructive" onClick={() => { void stopSession() }}><Square className="size-3.5" aria-hidden />Stop session</Button> : <>
        <Button size="sm" variant="outline" onClick={preview}><LayoutPanelTop className="size-3.5" aria-hidden />Preview overlay</Button>
        <Button size="sm" variant="outline" onClick={() => setGate(true)}><Mic className="size-3.5" aria-hidden />Start live session…</Button>
        <Button size="sm" onClick={() => { void startPractice() }}><Play className="size-3.5" aria-hidden />Start practice</Button>
      </>}
      <ConsentGate open={gate} onOpenChange={setGate} onPractice={() => { setGate(false); if (jobId) void startPractice(); else gotoPage('setup') }} onStarted={() => setGate(false)} />
    </div>
  )
}
