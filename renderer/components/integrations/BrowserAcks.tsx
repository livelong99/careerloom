import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePolled } from '../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'

/** Sites whose terms you acknowledged for browser boards, each revocable. Revoking asks again on the next scan. */
export function BrowserAcks() {
  const acks = usePolled(() => careerloom.browserAcks(), [], { intervalMs: null })
  const [pending, setPending] = useState<string | null>(null)

  const revoke = async () => {
    if (!pending) return
    const domain = pending
    setPending(null)
    try {
      await careerloom.browserRevoke(domain)
      showToast(`Revoked ${domain}`)
      void acks.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="text-sm font-medium">Acknowledged sites</div>
      {acks.error ? (
        <p className="text-xs text-muted-foreground" role="alert">Couldn't load acknowledged sites yet: {acks.error.message}</p>
      ) : !acks.data ? (
        <p className="text-xs text-muted-foreground" role="status">Loading…</p>
      ) : acks.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet. You'll be asked once per site, the first time a browser board scans it.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {acks.data.map(domain => (
            <li key={domain} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-mono text-xs">{domain}</span>
              <Button size="sm" variant="ghost" aria-label={`Revoke ${domain}`} onClick={() => setPending(domain)}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={pending !== null} onOpenChange={v => { if (!v) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {pending}?</AlertDialogTitle>
            <AlertDialogDescription>Browser boards on this site stop scanning until you acknowledge its terms again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void revoke()}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
