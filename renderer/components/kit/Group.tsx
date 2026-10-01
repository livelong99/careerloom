// Page building blocks that match the prototype: a bordered group with a title row, and label/hint/control rows. Shared by Copilot and Settings.
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Group({ title, action, children, className, focus }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; /** Deep-link id (Settings `navigate('settings', { focus })`). */ focus?: string }) {
  return (
    <section aria-label={title} data-setting-id={focus} className={cn('rounded-xl border border-border bg-card/40 p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="m-0 text-sm font-semibold text-foreground">{title}</h3>}
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** label + hint on the left, control on the right; rows inside a Group are separated by a hairline. */
export function Row({ label, hint, htmlFor, children, stack, focus }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children?: ReactNode; stack?: boolean; focus?: string }) {
  return (
    <div data-setting-id={focus} className={cn('flex gap-4 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0', stack ? 'flex-col' : 'items-center justify-between')}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">{label}</label>
        {hint && <p className="m-0 mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children !== undefined && <div className={cn('flex shrink-0 items-center gap-2', stack && 'w-full')}>{children}</div>}
    </div>
  )
}

/** A quiet informational strip (privacy sentence, estimate caveat). */
export function Note({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ok' | 'warn' }) {
  return (
    <p role="note" className={cn('m-0 rounded-lg border px-3 py-2 text-xs', tone === 'ok' ? 'border-(--status-task-done)/40 bg-(--status-task-done)/10 text-foreground' : tone === 'warn' ? 'border-warning/40 bg-warning/10 text-foreground' : 'border-border bg-muted/40 text-muted-foreground')}>
      {children}
    </p>
  )
}
