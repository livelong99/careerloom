import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { navigate } from '../../lib/nav'
import { showToast } from '../../lib/toast'
import type { BrowserLoginStatus, Portal, PortalDetail, PortalPatch } from '../../lib/types'
import { DeletePortalsDialog } from '../jobs/PortalDialogs'
import { openRuns } from '../../lib/nav'

const MAX_URLS = 5
const MAX_GUIDELINE = 4000
type Draft = { name: string; urls: string[]; enabled: boolean; fetch: 'firecrawl' | 'browser' | null; provider: string; api: string; guideline: string }

const draftOf = (d: PortalDetail): Draft => ({ name: d.name, urls: d.urls.length ? d.urls : [''], enabled: d.enabled, fetch: d.fetch, provider: d.provider ?? '', api: d.api ?? '', guideline: d.guideline ?? '' })

function patchOf(from: Draft, to: Draft): PortalPatch {
  const p: PortalPatch = {}
  if (to.name !== from.name) p.name = to.name
  const urls = to.urls.map(u => u.trim()).filter(Boolean)
  if (urls.join('\n') !== from.urls.join('\n')) p.urls = urls
  if (to.enabled !== from.enabled) p.enabled = to.enabled
  if (to.fetch && to.fetch !== from.fetch) p.fetch = to.fetch
  if (to.provider !== from.provider) p.provider = to.provider.trim() || null
  if (to.api !== from.api) p.api = to.api.trim() || null
  return p
}

type Props = { id: string | null; portal: Portal | undefined; onClose: () => void; onSaved: () => void }

/** Right-side editor for one board: every portals.yml field it has, its guideline, Save / Cancel / Delete. */
export function BoardEditor({ id, portal, onClose, onSaved }: Props) {
  const { adopt } = useRuns()
  const [detail, setDetail] = useState<PortalDetail | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [urlErrors, setUrlErrors] = useState<Record<number, string>>({})
  const [login, setLogin] = useState<BrowserLoginStatus | null>(null)
  const [consented, setConsented] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setDetail(null); setDraft(null); setError(null); setUrlErrors({})
    if (!id) return
    let live = true // a slow response for the previously opened board must not overwrite this one
    careerloom.getPortal(id).then(d => { if (live) { setDetail(d); setDraft(draftOf(d)) } }).catch(err => { if (live) setError(normalizeCliError(err).message) })
    return () => { live = false }
  }, [id])
  useEffect(() => {
    if (draft?.fetch !== 'browser' || !id) return
    void careerloom.browserLoginStatus().then(setLogin).catch(() => undefined)
    void careerloom.browserConsentNeeded([id]).then(d => setConsented(d.length === 0)).catch(() => undefined)
  }, [draft?.fetch, id])

  const base = detail && draftOf(detail)
  const dirty = Boolean(base && draft && (Object.keys(patchOf(base, draft)).length > 0 || draft.guideline !== base.guideline))
  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d))
  const close = () => (dirty ? setConfirmDiscard(true) : onClose())

  const checkUrl = async (i: number, url: string) => {
    const msg = url.trim() ? await careerloom.checkBoardUrl(url) : null
    setUrlErrors(e => { const next = { ...e }; if (msg) next[i] = msg; else delete next[i]; return next })
  }

  const save = async () => {
    if (!id || !base || !draft) return
    setSaving(true)
    setError(null)
    try {
      const patch = patchOf(base, draft)
      let next = detail!
      if (Object.keys(patch).length) next = await careerloom.updatePortal(id, patch)
      if (draft.guideline !== base.guideline) await careerloom.setPortalGuideline(next.id, draft.guideline)
      showToast(`Saved ${next.name}`)
      onSaved()
      onClose()
    } catch (err) {
      setError(normalizeCliError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const improve = async () => {
    if (!id || !draft?.guideline.trim()) return
    try {
      const run = await careerloom.improvePortalGuideline(id, draft.guideline)
      adopt(run)
      showToast('Improving the guideline — the agent saves it when done')
      openRuns(run.id)
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    }
  }

  const isAts = detail && !detail.fetch
  const label = 'mb-1 block text-xs font-medium text-muted-foreground'

  return (
    <>
      <Sheet open={Boolean(id)} onOpenChange={open => { if (!open) close() }}>
        <SheetContent side="right" className="flex w-[min(560px,94vw)] flex-col gap-0 p-0 sm:max-w-none">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>{detail?.name ?? portal?.name ?? 'Board'}</SheetTitle>
            <SheetDescription>{detail ? (detail.list === 'job_boards' ? 'Job board (portals.yml › job_boards)' : detail.fetch ? `Web board · ${detail.fetch === 'browser' ? 'Browser' : 'Firecrawl'}` : 'Company ATS (portals.yml › tracked_companies)') : 'Loading…'}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!draft && !error && <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-24 w-full" /></div>}
            {error && <p className="rounded-md border border-border p-2 text-sm text-destructive" role="alert">{error}</p>}
            {draft && (
              <>
                <div>
                  <label className={label} htmlFor="be-name">Name</label>
                  <Input id="be-name" value={draft.name} maxLength={100} onChange={e => set({ name: e.target.value })} className="h-8" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Enabled <span className="text-xs text-muted-foreground">— included in “Scan all”{draft.fetch === 'browser' ? ' (browser boards: only when selected)' : ''}</span></span>
                  <ToggleSwitch checked={draft.enabled} aria-label="Enabled" onCheckedChange={v => set({ enabled: v })} />
                </div>
                <div>
                  <span className={label}>{draft.fetch ? `Listing URLs (up to ${MAX_URLS})` : 'Careers URL'}</span>
                  <div className="space-y-2">
                    {draft.urls.map((u, i) => (
                      <div key={i}>
                        <div className="flex gap-1">
                          <Input
                            value={u} aria-label={`URL ${i + 1}`} aria-invalid={Boolean(urlErrors[i])} className="h-8 flex-1 font-mono text-xs"
                            onChange={e => set({ urls: draft.urls.map((x, j) => (j === i ? e.target.value : x)) })}
                            onBlur={e => void checkUrl(i, e.target.value)}
                          />
                          {draft.urls.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remove URL ${i + 1}`} onClick={() => { set({ urls: draft.urls.filter((_, j) => j !== i) }); setUrlErrors({}) }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {urlErrors[i] && <p className="mt-1 text-xs text-destructive">{urlErrors[i]}</p>}
                      </div>
                    ))}
                    {draft.fetch && draft.urls.length < MAX_URLS && (
                      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1" onClick={() => set({ urls: [...draft.urls, ''] })}><Plus className="h-3.5 w-3.5" /> Add a page URL</Button>
                    )}
                  </div>
                </div>
                {draft.fetch && (
                  <div role="radiogroup" aria-label="Fetch with">
                    <span className={label}>Fetch with</span>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1.5"><input type="radio" checked={draft.fetch === 'firecrawl'} onChange={() => set({ fetch: 'firecrawl' })} /> Firecrawl (public pages)</label>
                      <label className="flex items-center gap-1.5"><input type="radio" checked={draft.fetch === 'browser'} onChange={() => set({ fetch: 'browser' })} /> Browser (your login)</label>
                    </div>
                  </div>
                )}
                {draft.fetch === 'browser' && (
                  <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                    <p>Read by your agent in Chrome, read-only, with only this site’s cookies from <b className="text-foreground">{login?.label ?? '…'}</b>. Scanned only when you select it.</p>
                    <p className="mt-1">Terms acknowledgement: {consented === null ? '…' : consented ? 'given' : 'asked on the first scan'}.{' '}
                      <button type="button" className="cursor-pointer underline underline-offset-2 hover:text-foreground" onClick={() => navigate('integrations')}>Browser login settings</button>
                    </p>
                  </div>
                )}
                {isAts && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label} htmlFor="be-provider">Provider</label>
                      <Input id="be-provider" value={draft.provider} placeholder="auto-detect" onChange={e => set({ provider: e.target.value })} className="h-8 font-mono text-xs" />
                    </div>
                    <div>
                      <label className={label} htmlFor="be-api">API URL (optional)</label>
                      <Input id="be-api" value={draft.api} onChange={e => set({ api: e.target.value })} className="h-8 font-mono text-xs" />
                    </div>
                  </div>
                )}
                <div>
                  <label className={label} htmlFor="be-guideline">Guidelines for scanning and evaluating this board</label>
                  <Textarea
                    id="be-guideline" rows={6} value={draft.guideline} maxLength={MAX_GUIDELINE} className="max-h-64 overflow-y-auto"
                    placeholder="e.g. Only India or remote, backend roles. Treat on-call heavy SRE roles as a 2/5 fit."
                    onChange={e => set({ guideline: e.target.value })}
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <Button variant="ghost" size="sm" className="h-7 px-2" disabled={!draft.guideline.trim()} onClick={() => void improve()}>Improve with agent</Button>
                    <span className="tabular-nums">{draft.guideline.length} / {MAX_GUIDELINE}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border p-4">
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive" disabled={!detail} onClick={() => setDeleting(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete board
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-8" onClick={close}>Cancel</Button>
            <Button size="sm" className="h-8" disabled={!dirty || saving || Object.keys(urlErrors).length > 0} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>The edits to {draft?.name ?? 'this board'} haven’t been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { setConfirmDiscard(false); onClose() }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {deleting && portal && <DeletePortalsDialog portals={[portal]} onClose={() => setDeleting(false)} onDeleted={() => { onSaved(); onClose() }} />}
    </>
  )
}
