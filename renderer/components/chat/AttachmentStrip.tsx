import { AlertCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AttachIssue, PendingImage } from './useAttachments'

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** Thumbnails of images queued for the next message, plus why any file was turned away. */
export function AttachmentStrip({ items, issues, onRemove, onDismiss }: { items: PendingImage[]; issues: AttachIssue[]; onRemove: (id: string) => void; onDismiss: (id: string) => void }) {
  if (!items.length && !issues.length) return null
  return (
    <div className="mb-2 space-y-1.5">
      {items.length > 0 && (
        <ul aria-label="Attached images" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map(i => (
            <li key={i.id} className="group relative size-16 overflow-hidden rounded-md border border-border bg-[var(--card-inner)]">
              <img src={i.dataUrl} alt={i.name} className="size-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-background/80 px-1 text-[10px] leading-4 tabular-nums text-muted-foreground">{kb(i.bytes)}</span>
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                aria-label={`Remove ${i.name}`}
                onClick={() => onRemove(i.id)}
                className="absolute top-0.5 right-0.5 size-5 opacity-90 shadow-sm"
              ><X aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <ul role="alert" className="m-0 list-none space-y-1 p-0">
          {issues.map(i => (
            <li key={i.id} className="flex items-center gap-2 rounded-md bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate"><strong className="font-medium">{i.name}</strong>: {i.reason}</span>
              <Button type="button" variant="subtle" size="icon-xs" aria-label={`Dismiss message about ${i.name}`} onClick={() => onDismiss(i.id)}><X aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
