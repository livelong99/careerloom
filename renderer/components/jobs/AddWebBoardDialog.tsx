import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { WebBoardPreview } from '../../lib/types'
import { goToIntegrations } from './PortalRail'

const MAX_GUIDELINE = 4000

const hostName = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

/** Add any job board: listing URL(s) + optional instructions, scanned via Firecrawl (+ agent when the page has no JSON-LD). */
export function AddWebBoardDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [urlsText, setUrlsText] = useState('')
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [fetchWith, setFetchWith] = useState<'firecrawl' | 'browser'>('firecrawl')
  const [preview, setPreview] = useState<WebBoardPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'add' | null>(null)

  const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean)
  const firecrawlDown = Boolean(error?.includes('Firecrawl'))

  const run = async (kind: 'preview' | 'add', fn: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try { await fn() } catch (err) { setError(normalizeCliError(err).message) } finally { setBusy(null) }
  }
  const check = () => run('preview', async () => { setPreview(await careerloom.previewWebBoard(urls)) })
  const add = () => run('add', async () => {
    const { name: added } = await careerloom.addWebBoard(name.trim() || hostName(urls[0] ?? ''), urls, instructions, fetchWith)
    showToast(`Added ${added} — select it and Scan`)
    onAdded()
    onClose()
  })

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a job board</DialogTitle>
          <DialogDescription>
            Any listing or search page. Supported ATS links (Greenhouse, Lever, Ashby…) use their API; anything else is scraped with Firecrawl and, when the page has no structured data, read by your agent.
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium" htmlFor="web-board-urls">Listing URL(s) — one per line, up to 5</label>
        <Textarea
          id="web-board-urls" autoFocus rows={3} value={urlsText}
          placeholder="https://example-jobs.com/search?q=backend&location=india"
          onChange={e => { setUrlsText(e.target.value); setPreview(null) }}
        />
        <label className="text-sm font-medium" htmlFor="web-board-name">Name</label>
        <Input id="web-board-name" value={name} maxLength={100} placeholder={hostName(urls[0] ?? '') || 'Board name'} onChange={e => setName(e.target.value)} />
        <fieldset className="flex flex-wrap items-center gap-3 text-sm">
          <legend className="sr-only">Fetch with</legend>
          <span className="font-medium">Fetch with</span>
          <label className="flex items-center gap-1.5"><input type="radio" checked={fetchWith === 'firecrawl'} onChange={() => { setFetchWith('firecrawl'); setPreview(null) }} /> Firecrawl (public pages)</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={fetchWith === 'browser'} onChange={() => { setFetchWith('browser'); setPreview(null) }} /> Browser (your login)</label>
        </fieldset>
        {fetchWith === 'browser' && (
          <p className="text-xs text-muted-foreground">
            Your agent (Claude Code or Codex) reads the listings in Chrome with only this site’s cookies from Integrations → Browser login. Read-only — it never clicks, applies or messages. Runs only when you scan it by hand.
          </p>
        )}
        <label className="text-sm font-medium" htmlFor="web-board-instructions">Instructions (optional)</label>
        <Textarea
          id="web-board-instructions" rows={3} value={instructions} maxLength={MAX_GUIDELINE}
          placeholder="e.g. Only India or remote, backend roles. Saved as this portal's guidelines."
          onChange={e => setInstructions(e.target.value)}
        />
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-border p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            {firecrawlDown && <Button size="sm" variant="secondary" onClick={() => { onClose(); goToIntegrations() }}>Open Integrations</Button>}
          </div>
        )}
        {preview && <PreviewResult preview={preview} />}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="sm" disabled={busy !== null || !urls.length || fetchWith === 'browser'} onClick={() => void check()} title={fetchWith === 'browser' ? 'Preview needs a scan — browser boards have no cheap preview' : undefined}>
            {busy === 'preview' ? 'Scraping…' : 'Preview extraction'}
          </Button>
          <Button size="sm" disabled={busy !== null || !urls.length} onClick={() => void add()}>{busy === 'add' ? 'Adding…' : 'Add board'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewResult({ preview }: { preview: WebBoardPreview }) {
  if (preview.method === 'provider') return <p className="rounded-md border border-border p-3 text-sm">Recognised as a {preview.provider} board — it’s added as a regular portal (API, no scraping).</p>
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      {preview.method === 'json-ld'
        ? <p>{preview.count} jobs found in the page’s structured data (no agent needed).</p>
        : <p>No structured job data on this page ({preview.chars.toLocaleString()} chars scraped) — on scan your agent reads it and returns the jobs.</p>}
      {preview.nextPage && <p className="mt-1 truncate text-xs text-muted-foreground">Next page: {preview.nextPage}</p>}
      {preview.sample.length > 0 && (
        <ul className="mt-2 list-none space-y-1 p-0">
          {preview.sample.map(j => (
            <li key={j.url} className="truncate text-xs">
              <span className="font-medium">{j.title}</span>
              <span className="text-muted-foreground">{[j.company, j.location].filter(Boolean).map(s => ` · ${s}`).join('')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
