import { useEffect, useState } from 'react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { BrowserLoginStatus, Portal } from '../../lib/types'
import { openRuns } from '../RunsDrawer'

const MAX_GUIDELINE = 4000

export function GuidelineDialog({ portal, onClose, onSaved }: { portal: Portal; onClose: () => void; onSaved: () => void }) {
  const { adopt } = useRuns()
  const [draft, setDraft] = useState(portal.guideline ?? '')
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); onSaved(); onClose() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setBusy(false) }
  }
  const save = () => act(async () => {
    await careerloom.setPortalGuideline(portal.id, draft)
    showToast(draft.trim() ? `Saved guidelines for ${portal.name}` : `Removed guidelines for ${portal.name}`)
  })
  const improve = () => act(async () => {
    const run = await careerloom.improvePortalGuideline(portal.id, draft)
    adopt(run)
    showToast(`Improving guidelines for ${portal.name} — the agent saves them when done`)
    openRuns()
  })

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Guidelines for {portal.name}</DialogTitle>
          <DialogDescription>
            Rules the agent follows when scanning and evaluating this portal’s jobs, on top of your defaults. Saved to modes/_custom.md.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus rows={10} value={draft} maxLength={MAX_GUIDELINE} aria-label="Guideline text"
          placeholder="e.g. Only staff-level platform roles. Treat on-call heavy SRE roles as a 2/5 fit. Prefer remote in EU time zones."
          onChange={e => setDraft(e.target.value)}
        />
        <div className="text-right text-xs tabular-nums text-muted-foreground">{draft.length} / {MAX_GUIDELINE}</div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="sm" disabled={busy || !draft.trim()} onClick={() => void improve()} title="An agent rewrites your draft using career-ops modes and installed skills">
            Improve with agent
          </Button>
          <Button size="sm" disabled={busy || draft === (portal.guideline ?? '')} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** First browser scan of a site: the terms warning plus where the login cookies come from. */
export function ConsentDialog({ domains, onCancel, onAccept }: { domains: string[]; onCancel: () => void; onAccept: () => Promise<void> }) {
  const [login, setLogin] = useState<BrowserLoginStatus | null>(null)
  const [source, setSource] = useState<BrowserLoginStatus['source']>('chrome')
  const [profile, setProfile] = useState('Default')
  const [file, setFile] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void careerloom.browserLoginStatus().then(s => { setLogin(s); setSource(s.source); setProfile(s.profile); setFile(s.cookiesFile) }).catch(() => undefined)
  }, [])

  const accept = async () => {
    setBusy(true)
    try {
      const patch: Record<string, string> = source === 'chrome' ? { source, profile } : source === 'file' ? { source, cookiesFile: file } : { source }
      await careerloom.setIntegrationConfig('service:browser', patch)
      await onAccept()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Read {domains.join(', ')} in your browser session?</DialogTitle>
          <DialogDescription>
            Sites like LinkedIn, Glassdoor, Indeed and Naukri prohibit automated access in their terms; your account could be restricted.
            Careerloom only reads listings in your own session — at most 3 pages, slowly, when you click Scan — and never applies or messages.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2 text-sm" disabled={!login}>
          <legend className="mb-1 font-medium">Sign in with</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={source === 'chrome'} onChange={() => setSource('chrome')} /> Chrome profile
            <select
              aria-label="Chrome profile" value={profile} onChange={e => { setProfile(e.target.value); setSource('chrome') }}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {(login?.profiles ?? ['Default']).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={source === 'file'} onChange={() => setSource('file')} /> cookies.txt
            <Input className="h-8 flex-1" placeholder="/Users/you/Downloads/cookies.txt" value={file} onChange={e => { setFile(e.target.value); setSource('file') }} />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={source === 'off'} onChange={() => setSource('off')} /> Continue without login (public pages only)
          </label>
          <p className="text-xs text-muted-foreground">Only {domains.join(', ')} cookies are loaded — counted in the run log, never shown. macOS may ask once for Chrome’s Keychain key.</p>
        </fieldset>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={busy || !login || (source === 'file' && !file.trim())} onClick={() => void accept()}>I understand — scan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Delete portals: evaluated jobs stay; optionally hide their unevaluated ones from Careerloom. */
export function DeletePortalsDialog({ portals, onClose, onDeleted }: { portals: Portal[]; onClose: () => void; onDeleted: () => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [hide, setHide] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void careerloom.countUnevaluated(portals.map(p => p.id)).then(setCounts).catch(() => setCounts({})) }, [portals])
  const unevaluated = Object.values(counts ?? {}).reduce((a, b) => a + b, 0)
  const what = portals.length === 1 ? portals[0]!.name : `${portals.length} portals`

  const remove = async () => {
    setBusy(true)
    try {
      const { hidden } = await careerloom.deletePortals(portals.map(p => p.id), hide)
      showToast(`Deleted ${what}${hidden ? ` · hid ${hidden} unevaluated job${hidden === 1 ? '' : 's'}` : ''}`)
      onDeleted()
      onClose()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={open => { if (!open) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes {portals.length === 1 ? 'it' : 'them'} from portals.yml, with {portals.length === 1 ? 'its' : 'their'} guidelines. Evaluated jobs and reports stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {unevaluated > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hide} onCheckedChange={v => setHide(v === true)} />
            Also remove its {unevaluated} unevaluated job{unevaluated === 1 ? '' : 's'} from Careerloom’s list
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={busy || counts === null} onClick={e => { e.preventDefault(); void remove() }}>
            {busy ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
