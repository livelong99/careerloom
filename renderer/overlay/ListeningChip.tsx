import type { OverlayViewState } from '../../electron/contract'

/** Driven by capture state (main), never by which card is showing. `null` = indicator off (Privacy mode only). */
export function ListeningChip({ state, practice, sys, indicator, time }: { state: OverlayViewState; practice: boolean; sys: boolean; indicator: 'chip' | 'dot' | 'off'; time: string }) {
  const off = state === 'idle' || state === 'stopped'
  if (indicator === 'off' && !off) return null
  if (indicator === 'dot' && !off) {
    return <span className={`chipL dotonly${sys ? '' : ' mic'}`} role="status" aria-label="Listening"><span className="d" /><span className="t">{time}</span></span>
  }
  if (state === 'idle') return <span className="chipL idle"><span className="d" />Not listening</span>
  if (state === 'stopped') return <span className="chipL stopped"><span className="d" />Stopped</span>
  if (practice) return <span className="chipL practice" role="status" aria-label="Practice, nothing is sent to a call"><span className="d" />Practice<span className="t">{time}</span></span>
  return (
    <span className={`chipL${sys ? '' : ' mic'}`} role="status" aria-label={`Listening, ${sys ? 'mic and system audio' : 'mic only'}`}>
      <span className="d" />Listening{sys ? '' : ' · mic only'}<span className="t">{time}</span>
    </span>
  )
}
