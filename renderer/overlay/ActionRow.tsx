import { OvIcon, type OvIconName } from './OvIcon'
import type { OverlayViewData } from './types'

export function OvButton({ icon, label, kbd, primary, onClick, disabled, title }: { icon: OvIconName; label: string; kbd?: string; primary?: boolean; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={`ab${primary ? ' pri' : ''}`} onClick={onClick} disabled={disabled || !onClick} title={title}>
      <OvIcon name={icon} />{label}{kbd ? <span className="kbd">{kbd}</span> : null}
    </button>
  )
}

type Keys = { answer: string; followup: string; clarify: string; screenshot: string; summarise: string }
type Handlers = { answer?: (kind: 'answer' | 'followup' | 'clarify' | 'summarise') => void; screenshot?: () => void; fixScreen?: () => void }
type Screen = OverlayViewData['screen']

const BLOCKED_LABEL = { permission: 'Allow screen access', off: 'Screenshots off', ocr: 'OCR not available', 'no-vision': 'Not a vision model', budget: 'Limit reached', failed: 'Capture failed' } as const

/** The Screenshot button reflects what the action can do right now; colour is never the only signal (every state has text). */
function ScreenshotButton({ kbd, screen, on }: { kbd: string; screen: Screen; on: Handlers }) {
  switch (screen.state) {
    case 'capturing': return <OvButton icon="camera" label="Capturing…" disabled onClick={on.screenshot} />
    case 'sent': return <OvButton icon="check" label="Sent" disabled onClick={on.screenshot} />
    case 'ready': return <OvButton icon="refresh" label="Re-answer with screen" kbd={kbd} onClick={on.screenshot} />
    case 'blocked': {
      const reason = screen.reason ?? 'failed'
      return reason === 'permission'
        ? <OvButton icon="warn" label={BLOCKED_LABEL.permission} onClick={on.fixScreen} />
        : <OvButton icon="warn" label={BLOCKED_LABEL[reason]} disabled onClick={on.screenshot} title={screen.message} />
    }
    default: return <OvButton icon="camera" label="Screenshot" kbd={kbd} onClick={on.screenshot} />
  }
}

export function ActionRow({ keys, on, screen }: { keys: Keys; on: Handlers; screen: Screen }) {
  const ask = (kind: 'answer' | 'followup' | 'clarify' | 'summarise') => (on.answer ? () => on.answer?.(kind) : undefined)
  return (
    <>
      <div className="acts">
        <OvButton icon="spark" label="Answer" kbd={keys.answer} primary onClick={ask('answer')} />
        <OvButton icon="chat" label="Follow-up" kbd={keys.followup} onClick={ask('followup')} />
        <OvButton icon="help" label="Clarify" kbd={keys.clarify} onClick={ask('clarify')} />
        <ScreenshotButton kbd={keys.screenshot} screen={screen} on={on} />
        <OvButton icon="list" label="Summarise" kbd={keys.summarise} onClick={ask('summarise')} />
      </div>
      {screen.state === 'blocked' && screen.message ? <p className="scr-note" role="status">{screen.message}</p> : null}
    </>
  )
}
