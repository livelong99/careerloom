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
}

/** Left rail: All / Skills / Job sources / Services / Plugins, each with a count. */
export function CategoryNav({ counts, value, onChange }: Props) {
  const order: Category[] = ['all', 'skill', 'source', 'service', 'plugin']
  return (
    <nav className="flex shrink-0 flex-col gap-0.5 sm:w-40" aria-label="Integration categories">
      {order.map(cat => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          className={cn(
            'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors',
            value === cat ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60',
          )}
        >
          <span>{CATEGORY_LABELS[cat]}</span>
          <span className="text-xs text-muted-foreground">{counts[cat] ?? 0}</span>
        </button>
      ))}
    </nav>
  )
}
