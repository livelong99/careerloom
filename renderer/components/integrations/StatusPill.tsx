import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { IntegrationStatus } from '../../lib/types'

const STYLES: Record<IntegrationStatus, string> = {
  ready: 'text-success bg-success/15',
  needs_setup: 'text-warning bg-warning/15',
  error: 'text-destructive bg-destructive/15',
  not_installed: 'text-muted-foreground bg-muted',
  off: 'text-muted-foreground bg-muted',
}

/** A readable status chip — normal case, ≥12px, clear semantic color per
 *  status (not the tiny uppercase-mono Badge, which read as invisible here). */
export function StatusPill({ status, children }: { status: IntegrationStatus; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium normal-case', STYLES[status])}>
      {children}
    </span>
  )
}
