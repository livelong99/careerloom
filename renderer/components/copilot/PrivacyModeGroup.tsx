import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import type { CopilotConfig, DeepPartial } from '@/lib/types'
import { errorText } from './api'
import { Group, Row } from './Group'
import { SegTabs } from '@/components/SegTabs'
import { NOTICE_VERSION, PrivacyModeNotice } from './wp1'

type Mode = CopilotConfig['privacy']['mode']
export const DEFAULT_MODE: Mode = { enabled: false, noticeVersion: null, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' }

const SYMBOLS: Record<string, string> = { Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘' }
/** Electron accelerator → mac glyphs: Control+Alt+Shift+H → ⌃⌥⇧H. */
export const accelLabel = (accel: string): string => accel.split('+').map(k => SYMBOLS[k] ?? k).join('')

type Save = (patch: DeepPartial<CopilotConfig>) => Promise<unknown>

/** Opt-in, OFF by default. Turning it on goes through the notice first; the ack is validated in main. TODO-legal: copy follows design.md §7b. */
export function PrivacyModeGroup({ mode, clickThroughIdle, quickHide, save }: { mode: Mode; clickThroughIdle: boolean; quickHide: string; save: Save }) {
  const [notice, setNotice] = useState(false)
  const off = !mode.enabled
  const set = (patch: Partial<Mode>) => { void save({ privacy: { mode: patch } }) }

  async function accept(): Promise<void> {
    setNotice(false)
    try {
      const r = await careerloom.copilotAckPrivacyNotice(NOTICE_VERSION)
      if (r.ok) await save({ privacy: { mode: { enabled: true } } })
      else showToast('Privacy mode could not be confirmed. Try again.', 'error')
    } catch (e) { showToast(errorText(e), 'error') }
  }
  const toggle = (on: boolean) => {
    if (on) setNotice(true)
    else set({ enabled: false, hideFromCapture: DEFAULT_MODE.hideFromCapture, noDockIcon: DEFAULT_MODE.noDockIcon, neutralTitle: DEFAULT_MODE.neutralTitle, indicator: DEFAULT_MODE.indicator })
  }

  return (
    <Group title="Privacy mode" action={<><Badge>{off ? 'Off by default' : 'On'}</Badge><ToggleSwitch aria-label="Privacy mode" checked={mode.enabled} onCheckedChange={toggle} /></>}>
      <p className="m-0 mb-3 text-xs text-muted-foreground">
        {/* TODO-legal */}
        Low-profile options for when you don&apos;t want the overlay to draw attention on your own screen. They don&apos;t change who can hear the call, and some interviewers and employers don&apos;t allow AI help.
      </p>
      <Row label="Hide overlay from screen sharing" hint={<>Asks the system to leave the overlay out of screen capture. <Badge variant="warn" className="ml-1">Unreliable on macOS 15+</Badge> It does nothing against cameras, proctoring tools or someone watching your screen.</>}>
        <ToggleSwitch aria-label="Hide from screen sharing" disabled={off} checked={mode.hideFromCapture} onCheckedChange={v => set({ hideFromCapture: v })} />
      </Row>
      <Row label="No Dock icon while listening" hint="The menu bar icon stays so you can always stop.">
        <ToggleSwitch aria-label="No dock icon" disabled={off} checked={mode.noDockIcon} onCheckedChange={v => set({ noDockIcon: v })} />
      </Row>
      <Row label="Neutral window title" hint="Window lists show “Careerloom” only, never a job, company or question.">
        <ToggleSwitch aria-label="Neutral title" disabled={off} checked={mode.neutralTitle} onCheckedChange={v => set({ neutralTitle: v })} />
      </Row>
      <Row label="Click through when idle" hint="Same setting as Appearance. Clicks pass to the call.">
        <ToggleSwitch aria-label="Click-through" disabled={off} checked={clickThroughIdle} onCheckedChange={v => { void save({ overlay: { clickThroughIdle: v } }) }} />
      </Row>
      <Row label={<>Quick hide <Kbd className="ml-1.5">{accelLabel(quickHide)}</Kbd></>} hint="Hides the overlay and clears its text at once. Press again to bring it back.">
        <Badge>Hotkey</Badge>
      </Row>
      <Row label="Recording indicator" hint="The menu bar icon always shows when audio is being captured, whatever you choose here.">
        <div aria-disabled={off} className={off ? 'pointer-events-none opacity-50' : undefined}>
          <SegTabs options={[{ value: 'chip', label: 'Full' }, { value: 'dot', label: 'Small dot' }, { value: 'off', label: 'Off' }]} value={mode.indicator} onChange={v => set({ indicator: v as Mode['indicator'] })} />
        </div>
      </Row>
      <PrivacyModeNotice open={notice} onCancel={() => setNotice(false)} onAccept={() => void accept()} />
    </Group>
  )
}
