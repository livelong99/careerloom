import { ExternalLink } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { IntegrationKind } from '../../lib/types'

export type Category = 'all' | IntegrationKind

export const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All', skill: 'Skills', source: 'Job sources', service: 'Services', plugin: 'Plugins',
}

type Props = {
  counts: Record<Category, number>
  value: Category
  onChange: (v: Category) => void
  /** When set, "Job sources" is a link (to Boards) instead of a filter. */
  onOpenSources?: () => void
}

/** Filter tabs: All / Services / Skills / Plugins / Job sources, each with a count. */
export function CategoryNav({ counts, value, onChange, onOpenSources }: Props) {
  const order: Category[] = ['all', 'service', 'skill', 'plugin', 'source']
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Integration categories">
      {order.map(cat => {
        const link = cat === 'source' && onOpenSources
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={link ? undefined : value === cat}
            onClick={() => (link ? onOpenSources() : onChange(cat))}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              !link && value === cat ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            <span>{CATEGORY_LABELS[cat]}</span>
            <span className="text-xs text-muted-foreground">{counts[cat] ?? 0}</span>
            {link && <ExternalLink className="h-3 w-3" aria-label="opens Boards" />}
          </button>
        )
      })}
    </nav>
  )
}
