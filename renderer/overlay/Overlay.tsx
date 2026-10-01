// The overlay window's root: wires events + config to OverlayView and sends the few commands the overlay owns.
// It never takes focus; hotkeys (global, main) drive answers, and the card is click-through except under the pointer.
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CopilotConfig } from '../../electron/contract'
import { OVERLAY_CMD_CHANNEL, type OverlayCmdEvent } from '../../electron/copilot/overlay-events'
import { Caption } from './Caption'
import { InterviewControls } from './InterviewControls'
import { InterviewerRow } from './InterviewerRow'
import { OverlayView } from './OverlayView'
import { buildOverlayData } from './buildData'
import type { OverlayActions } from './types'
import { clampWidth, ResizeGrip } from './ResizeGrip'
import { useCopilotEvents } from './useCopilotEvents'
import { useInterviewer } from './useInterviewer'
import { useMicCapture } from './useMicCapture'

const HEARTBEAT_MS = 1000
type Anchor = CopilotConfig['overlay']['anchor']
const VERTICAL: Record<Anchor, 'flex-start' | 'center' | 'flex-end'> = { tl: 'flex-start', tc: 'flex-start', tr: 'flex-start', ml: 'center', c: 'center', mr: 'center', bl: 'flex-end', bc: 'flex-end', br: 'flex-end' }
const HORIZONTAL: Record<Anchor, 'flex-start' | 'center' | 'flex-end'> = { tl: 'flex-start', ml: 'flex-start', bl: 'flex-start', tc: 'center', c: 'center', bc: 'center', tr: 'flex-end', mr: 'flex-end', br: 'flex-end' }

const bridge = () => window.careerloom
// Private main → overlay channel (see overlay-events.ts); the preload bridge subscribes by name.
const onOverlayCmd = (cb: (e: OverlayCmdEvent) => void): (() => void) =>
  (bridge().onCopilotEvent as unknown as (name: string, cb: (e: OverlayCmdEvent) => void) => () => void)(OVERLAY_CMD_CHANNEL.replace('careerloom:', ''), cb)

/** null until the first read: electron/copilot/config.ts is main-only, so there is no renderer-side default to show. */
function useConfig(refreshOn: unknown): [CopilotConfig | null, () => void] {
  const [cfg, setCfg] = useState<CopilotConfig | null>(null)
  const load = useCallback(() => { bridge().copilotGetConfig().then(setCfg).catch(() => undefined) }, [])
  useEffect(load, [load, refreshOn])
  useEffect(() => onOverlayCmd(e => { if (e.layout || e.anchor) load() }), [load])
  return [cfg, load]
}

function useTheme(pref: CopilotConfig['overlay']['theme'] | undefined): 'dark' | 'light' {
  const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(query?.matches ?? true)
  useEffect(() => {
    if (!query) return
    const on = () => setDark(query.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  return pref === 'dark' || pref === 'light' ? pref : dark ? 'dark' : 'light'
}

export function Overlay() {
  const model = useCopilotEvents()
  const iv = useInterviewer()
  const [cfg, reloadConfig] = useConfig(model.session?.state)
  const theme = useTheme(cfg?.overlay.theme)
  const [wiped, setWiped] = useState(false)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const frozen = useRef<number | null>(null)

  useEffect(() => onOverlayCmd(e => { if (e.wipe !== undefined) setWiped(e.wipe) }), [])
  // Kill-switch watchdog: main panics the session if these stop for 5 s while live.
  useEffect(() => {
    const id = setInterval(() => { bridge().copilotOverlay({}).catch(() => undefined) }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [])
  const state = model.session?.state
  // The overlay window owns the microphone while a session runs; main owns state, health and the kill switch.
  useMicCapture({ active: state === 'armed' || state === 'listening', sessionId: model.session?.sessionId ?? null, deviceId: cfg?.audio.micDeviceId ?? null, send: m => bridge().copilotAudio(m), onError: message => console.error('copilot mic failed:', message) })
  useEffect(() => {
    if (state === 'stopped') { frozen.current ??= Date.now(); setNow(frozen.current); return }
    frozen.current = null
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state])

  if (!cfg) return null
  const layout = cfg.overlay.layout
  const data = buildOverlayData(model, { cfg, layout, now, wiped })

  // Hover region: the window ignores the mouse (forwarding moves) until the pointer is over the card.
  const hover = (over: boolean) => { if (!data.passive) bridge().copilotOverlay({ passive: !over }).catch(() => undefined) }
  const sessionId = model.session?.sessionId ?? null
  const b = bridge()
  const on: OverlayActions = {
    answer: kind => { b.copilotAnswer(kind, model.question?.id).catch(() => undefined) },
    screenshot: () => { b.copilotScreenshot().catch(() => undefined) },
    fixScreen: () => { b.copilotOpenSystemSettings('screen').catch(() => undefined) },
    collapse: () => { b.copilotOverlay({ collapse: true }).catch(() => undefined) },
    expand: () => { b.copilotOverlay({ collapse: false }).catch(() => undefined) },
    stop: () => { b.copilotStop('panic').catch(() => undefined) },
    start: () => { b.copilotOverlay({ start: true }).catch(() => undefined) },
    retry: () => { b.copilotOverlay({ retry: true }).catch(() => undefined) },
    // Mic-only is what M1 captures; the choice is saved so a later system-audio build stays off until asked for.
    micOnly: () => { b.copilotSetConfig({ audio: { useSystem: false } }).catch(() => undefined) },
    switchOnDevice: () => { b.copilotSetConfig({ stt: { engine: 'moonshine' } }).then(() => b.copilotOverlay({ retry: true })).catch(() => undefined) },
    openDebrief: () => { b.copilotOverlay({ debrief: true }).catch(() => undefined) },
    fix: () => { b.copilotOpenSystemSettings(data.problem?.kind === 'mic' ? 'microphone' : 'system-audio').catch(() => undefined) },
    ...(sessionId ? { deleteTranscript: () => { b.copilotDeleteSession(sessionId).catch(() => undefined) } } : {}),
  }

  return (
    <div className="ov-win" style={{ alignItems: VERTICAL[cfg.overlay.anchor], justifyContent: HORIZONTAL[cfg.overlay.anchor] }}>
      <div style={{ position: 'relative' }} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
        <OverlayView data={data} on={on} theme={theme} interview={iv.active ? { top: <><InterviewerRow state={iv.state} voice={iv.voice} /><Caption text={iv.question?.text ?? null} /></>, bottom: <InterviewControls onControl={c => { b.copilotOverlay({ interviewer: c }).catch(() => undefined) }} /> } : undefined} fontPx={cfg.overlay.fontPx} widthPx={layout === 'panel' ? (dragWidth ?? clampWidth(cfg.overlay.width)) : undefined} opacity={cfg.overlay.opacity} />
        {layout === 'panel' ? <ResizeGrip width={dragWidth ?? clampWidth(cfg.overlay.width)} onPreview={setDragWidth} onCommit={w => { setDragWidth(null); bridge().copilotSetConfig({ overlay: { width: w } }).then(reloadConfig).catch(() => undefined) }} /> : null}
      </div>
    </div>
  )
}
