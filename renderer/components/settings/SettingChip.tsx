import type { ReactNode } from 'react'

import { goToSettings } from '@/lib/nav'
import type { PageId } from './pages'

/** A setting shown read-only on a working screen, with a deep link to its single editor in Settings. */
export function SettingChip({ label, value, page, focus }: { label: string; value?: ReactNode; page: PageId; focus?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 py-0.5 pr-1 pl-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {value ? <span className="font-medium text-foreground">{value}</span> : null}
      <button
        type="button" aria-label={`Manage ${label} in Settings`} onClick={() => goToSettings(page, focus)}
        className="cursor-pointer rounded-full border-0 bg-transparent px-2 py-0.5 text-brand-text hover:bg-muted focus-visible:outline-2 focus-visible:outline-(--accent-text)"
      >
        Manage in Settings
      </button>
    </span>
  )
}
