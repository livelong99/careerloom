import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { CONSENT_VERSION, KB_CONSENT, PROVIDER_NAME } from './consentCopy'

type Props = { open: boolean; onOpenChange: (o: boolean) => void; backend: string; onAgree: (version: string) => Promise<void> }

/** First-run acknowledgement for web research; the version is stored in interview.json so a wording change asks again. */
export function ConsentDialog({ open, onOpenChange, backend, onAgree }: Props) {
  const [busy, setBusy] = useState(false)
  const agree = async (): Promise<void> => { setBusy(true); try { await onAgree(CONSENT_VERSION); onOpenChange(false) } finally { setBusy(false) } }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{KB_CONSENT.title}</DialogTitle>
          <DialogDescription>{KB_CONSENT.intro}</DialogDescription>
        </DialogHeader>
        <ul className="m-0 grid list-disc gap-2 pl-5 text-sm">{KB_CONSENT.points(PROVIDER_NAME[backend] ?? PROVIDER_NAME.none!).map(t => <li key={t}>{t}</li>)}</ul>
        <p className="m-0 text-xs text-muted-foreground">{KB_CONSENT.notLegal}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button disabled={busy} onClick={() => void agree()}>{KB_CONSENT.agree}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
