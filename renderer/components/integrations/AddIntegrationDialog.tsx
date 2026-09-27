import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { InstallPreview } from '../../lib/types'

type Props = {
  open: boolean
  onClose: () => void
  onInstalled: () => void
}

/** Paste a job board URL, a company name, or a GitHub skill URL → preview → confirm → install. */
export function AddIntegrationDialog({ open, onClose, onInstalled }: Props) {
  const [url, setUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [preview, setPreview] = useState<InstallPreview | null>(null)
  const [installing, setInstalling] = useState(false)

  const reset = () => { setUrl(''); setPreview(null); setChecking(false); setInstalling(false) }
  const close = () => { reset(); onClose() }

  const check = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setChecking(true)
    setPreview(null)
    try {
      setPreview(await careerloom.previewInstall(trimmed))
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error')
    } finally {
      setChecking(false)
    }
  }

  const install = async () => {
    if (!preview || preview.refusal) return
    setInstalling(true)
    try {
      await careerloom.installIntegration(url.trim())
      showToast(`Added ${preview.name}`)
      onInstalled()
      close()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add integration</DialogTitle>
          <DialogDescription>Paste a job board URL, a company name, or a github.com skill repo.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={url}
            onChange={e => { setUrl(e.target.value); setPreview(null) }}
            onKeyDown={e => { if (e.key === 'Enter') void check() }}
            placeholder="https://job-boards.greenhouse.io/openai, Stripe, or github.com/owner/skill"
            className="flex-1"
          />
          <Button variant="secondary" disabled={checking || !url.trim()} onClick={() => void check()}>{checking ? 'Checking…' : 'Check'}</Button>
        </div>
        {preview && (
          <div className="rounded-md border border-border p-3 text-sm">
            {preview.refusal ? (
              <p className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {preview.refusal}</p>
            ) : (
              <>
                <p>{preview.plan}</p>
                {preview.warnings.map(w => <p key={w} className="mt-1 text-xs text-muted-foreground">{w}</p>)}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button disabled={!preview || Boolean(preview.refusal) || installing} onClick={() => void install()}>
            {installing ? 'Adding…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
