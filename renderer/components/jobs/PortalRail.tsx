import { useState } from 'react'
import { AlertTriangle, PencilLine, Plus, Radar } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { Portal } from '../../lib/types'
import { openRuns } from '../RunsDrawer'
import { AddWebBoardDialog } from './AddWebBoardDialog'
import { toggle } from './filters'

const MAX_GUIDELINE = 4000
export const goToIntegrations = () => window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: 'integrations' }))

type Props = {
  portals: Portal[]
  total: number
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onChanged: () => void
}

/** Portal list: multi-select drives the Portal filter AND "Scan selected"; per-portal guidelines. */
export function PortalRail({ portals, total, selected, onSelectedChange, onChanged }: Props) {
  const { adopt } = useRuns()
  const [editing, setEditing] = useState<Portal | null>(null)
  const [scanning, setScanning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [firecrawlDown, setFirecrawlDown] = useState<string | null>(null)
  const [consent, setConsent] = useState<string[] | null>(null)

  const scan = async (acknowledged = false) => {
    setScanning(true)
    setFirecrawlDown(null)
    try {
      const needed = acknowledged ? [] : await careerloom.browserConsentNeeded(selected)
      if (needed.length) { setConsent(needed); return }
      const run = await careerloom.scanPortals(selected)
      adopt(run)
      showToast(`Started: ${run.label}`)
      openRuns()
    } catch (err) {
      const { message } = normalizeCliError(err)
      if (message.includes('Firecrawl')) setFirecrawlDown(message)
      else showToast(message, 'error', 6000)
    } finally {
      setScanning(false)
    }
  }

  const scanLabel = selected.length ? `Scan ${selected.length === 1 ? '1 portal' : `${selected.length} portals`}` : 'Scan all portals'

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2" aria-label="Portals">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium">Portals</span>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAdding(true)} title="Add any job board">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <ul className="m-0 flex max-h-[60vh] list-none flex-col overflow-y-auto rounded-md border border-(--line) bg-(--panel) px-0 py-1">
        <li>
          <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-(--hover)">
            <Checkbox checked={selected.length === 0} onCheckedChange={() => onSelectedChange([])} aria-label="All portals" />
            <span className="flex-1">All portals</span>
            <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">{total}</span>
            <span className="w-[22px] shrink-0" aria-hidden />
          </label>
        </li>
        {portals.map(p => (
          <li key={p.id} className="group flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-(--hover)">
            <Checkbox id={`portal-${p.id}`} checked={selected.includes(p.id)} onCheckedChange={() => onSelectedChange(toggle(selected, p.id))} />
            <label htmlFor={`portal-${p.id}`} className="min-w-0 flex-1 cursor-pointer" title={p.lastSeen ? `Last new job ${p.lastSeen}` : 'Not scanned yet'}>
              <span className={`block truncate${p.enabled ? '' : ' text-muted-foreground'}`}>
                {p.name}{p.ats && <span className="ml-1.5 text-xs text-muted-foreground">{p.ats}</span>}
                {p.fetch && <span className="ml-1.5 rounded bg-(--hover) px-1 text-[10px] text-muted-foreground" title={p.fetch === 'firecrawl' ? 'Scraped with Firecrawl; your agent extracts jobs when the page has no structured data' : 'Read by your agent in Chrome with this site’s login cookies; scanned only when selected'}>Web · {p.fetch === 'firecrawl' ? 'Firecrawl' : 'Browser'}</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {!p.enabled ? 'Disabled — scans only when selected' : p.lastSeen ? `Last seen ${p.lastSeen}` : 'Not scanned yet'}
              </span>
            </label>
            <span className="w-10 shrink-0 text-right tabular-nums text-xs">
              <span className="text-muted-foreground">{p.jobCount}</span>
              {p.newCount > 0 && <span className="ml-1 font-medium text-(--accent-text)" title={`${p.newCount} new in the last scan`}>+{p.newCount}</span>}
            </span>
            <button
              type="button" onClick={() => setEditing(p)}
              className={`shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-(--accent-text) ${p.guideline ? '' : 'opacity-0 group-hover:opacity-100'}`}
              aria-label={`${p.guideline ? 'Edit' : 'Add'} guidelines for ${p.name}`} title={p.guideline ? 'Has custom guidelines' : 'Add guidelines'}
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <Button size="sm" className="gap-1" disabled={scanning || portals.length === 0} onClick={() => void scan()}>
        <Radar className="h-3.5 w-3.5" /> {scanning ? 'Starting scan…' : scanLabel}
      </Button>
      {firecrawlDown && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2 text-xs text-destructive" role="alert">
          <span className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {firecrawlDown}</span>
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={goToIntegrations}>Open Integrations → Firecrawl</Button>
        </div>
      )}
      {consent && (
        <ConsentDialog
          domains={consent} onCancel={() => setConsent(null)}
          onAccept={async () => { await careerloom.acknowledgeBrowser(consent); setConsent(null); await scan(true) }}
        />
      )}
      {adding && <AddWebBoardDialog onClose={() => setAdding(false)} onAdded={onChanged} />}
      {editing && <GuidelineDialog portal={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </aside>
  )
}

function GuidelineDialog({ portal, onClose, onSaved }: { portal: Portal; onClose: () => void; onSaved: () => void }) {
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

function ConsentDialog({ domains, onCancel, onAccept }: { domains: string[]; onCancel: () => void; onAccept: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
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
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={() => { setBusy(true); void onAccept().finally(() => setBusy(false)) }}>I understand — scan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
