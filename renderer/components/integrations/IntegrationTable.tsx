import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { StatusPill } from './StatusPill'
import type { Integration } from '../../lib/types'

const isUserOwned = (i: Integration) => i.installedBy === 'user' && i.kind === 'skill'

type Props = {
  items: Integration[]
  expandedId: string | undefined
  onToggle: (id: string) => void
  renderDetail: (item: Integration) => ReactNode
}

/** Rows grouped by purpose (Core / Job data / Research / Extensions), one accordion detail at a time. */
export function IntegrationTable({ items, expandedId, onToggle, renderDetail }: Props) {
  const groups: Array<[string, Integration[]]> = [
    ['Core', items.filter(i => i.id === 'skill:career-ops')],
    ['Job data', items.filter(i => i.id === 'service:firecrawl' || i.id === 'service:browser')],
    ['Research', items.filter(i => i.id === 'service:searxng')],
    ['Extensions', items.filter(i => i.kind === 'skill' && i.id !== 'skill:career-ops')],
  ]

  return (
    <div className="flex flex-col">
      {groups.map(([group, rows]) => rows.length > 0 && (
        <div key={group} className="flex flex-col">
          <div className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">{group} <span className="text-muted-foreground/70">{rows.length}</span></div>
          {rows.map(item => {
            const expanded = item.id === expandedId
            return (
              <div key={item.id} data-setting-id={`integration:${item.id.split(':')[1]}`} className="rounded-md">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => onToggle(item.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      {isUserOwned(item) && <span className="text-xs text-muted-foreground">yours</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{item.summary}</p>
                  </div>
                  <StatusPill status={item.status}>{item.statusText}</StatusPill>
                </button>
                {expanded && <div className="border-t border-border/60">{renderDetail(item)}</div>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
