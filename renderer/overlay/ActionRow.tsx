import { OvIcon, type OvIconName } from './OvIcon'

export function OvButton({ icon, label, kbd, primary, onClick }: { icon: OvIconName; label: string; kbd?: string; primary?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`ab${primary ? ' pri' : ''}`} onClick={onClick} disabled={!onClick}>
      <OvIcon name={icon} />{label}{kbd ? <span className="kbd">{kbd}</span> : null}
    </button>
  )
}

type Keys = { answer: string; followup: string; clarify: string; screenshot: string; summarise: string }
type Handlers = { answer?: (kind: 'answer' | 'followup' | 'clarify' | 'summarise') => void; screenshot?: () => void }

export function ActionRow({ keys, on }: { keys: Keys; on: Handlers }) {
  const ask = (kind: 'answer' | 'followup' | 'clarify' | 'summarise') => (on.answer ? () => on.answer?.(kind) : undefined)
  return (
    <div className="acts">
      <OvButton icon="spark" label="Answer" kbd={keys.answer} primary onClick={ask('answer')} />
      <OvButton icon="chat" label="Follow-up" kbd={keys.followup} onClick={ask('followup')} />
      <OvButton icon="help" label="Clarify" kbd={keys.clarify} onClick={ask('clarify')} />
      <OvButton icon="camera" label="Screenshot" kbd={keys.screenshot} onClick={on.screenshot} />
      <OvButton icon="list" label="Summarise" kbd={keys.summarise} onClick={ask('summarise')} />
    </div>
  )
}
