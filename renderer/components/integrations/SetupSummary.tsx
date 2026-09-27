import { StatusPill } from './StatusPill'
import type { Integration } from '../../lib/types'

type Props = { items: Integration[] }

/** Small strip above the table: ready / needs setup / off counts. */
export function SetupSummary({ items }: Props) {
  const ready = items.filter(i => i.status === 'ready').length
  const needsSetup = items.filter(i => i.status === 'needs_setup' || i.status === 'error').length
  const off = items.filter(i => i.status === 'off').length
  return (
    <div className="flex items-center gap-3 text-sm">
      <StatusPill status="ready">{ready} ready</StatusPill>
      {needsSetup > 0 && <StatusPill status="needs_setup">{needsSetup} need setup</StatusPill>}
      {off > 0 && <StatusPill status="off">{off} off</StatusPill>}
      <span className="text-muted-foreground">{items.length} total</span>
    </div>
  )
}
