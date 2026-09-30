// Retention select used on the Privacy and Sessions pages. Lowering it shows how many sessions lose their text and asks first.
import { useState } from 'react'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import { errorText } from './api'
import { newlyExpired, RETENTION_OPTIONS } from './retention'

export function RetentionControl({ value, onChange, id }: { value: number | null; onChange: (days: number | null) => void; id?: string }) {
  const [pending, setPending] = useState<{ days: number | null; count: number } | null>(null)
  const current = RETENTION_OPTIONS.find(o => o.days === value)?.value ?? 'custom'

  async function pick(v: string): Promise<void> {
    const days = RETENTION_OPTIONS.find(o => o.value === v)?.days
    if (days === undefined) return
    try {
      const count = newlyExpired(await careerloom.copilotListSessions(), value, days)
      if (count > 0) setPending({ days, count }); else onChange(days)
    } catch (e) { showToast(errorText(e), 'error') }
  }

  return (
    <>
      <Select value={current} onValueChange={v => { void pick(v) }}>
        <SelectTrigger id={id} aria-label="Keep transcripts for" className="w-56"><SelectValue placeholder={value === null ? 'Until I delete them' : `${value} days`} /></SelectTrigger>
        <SelectContent>{RETENTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <AlertDialog open={pending !== null} onOpenChange={o => { if (!o) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transcripts older than this?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.count} {pending?.count === 1 ? 'session loses its' : 'sessions lose their'} transcript text now. Scores and notes stay. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) onChange(pending.days); setPending(null) }}>Delete transcript text</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
