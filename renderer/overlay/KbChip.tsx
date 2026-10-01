import type { KbRef } from '../../electron/contract'
import { OvIcon } from './OvIcon'

/** "From your question base": shown when a suggestion was given interview-side matches. Sourced items link out (main resolves the id and allow-lists the URL). */
export function KbChip({ items, open }: { items: KbRef[]; open?: (sourceId: string) => void }) {
  if (items.length === 0) return null
  return (
    <div className="kbchip" role="note" aria-label="From your question base">
      <span className="kbh"><OvIcon name="file" size={11} />From your question base</span>
      {items.map(i => (
        <span key={i.id} className="kbi">
          <span className="kbq">{i.text}</span>
          {i.sourceId && i.source && open ? <button type="button" className="kbs" onClick={() => open(i.sourceId!)} aria-label={`Open source: ${i.source}`}>{i.source}</button> : null}
        </span>
      ))}
    </div>
  )
}
