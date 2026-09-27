import { useEffect, useRef, useState } from 'react'

import { useRuns } from '../../hooks/useRuns'
import { careerloom } from '../../lib/ipc'
import type { CvTemplate } from '../../lib/types'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Skeleton } from '../ui/skeleton'
import { Textarea } from '../ui/textarea'
import { act } from './actions'
import { usePdf } from './usePdf'

/** Renders only once scrolled into view — each thumbnail is a real PDF render in main. */
function Thumb({ template, active, stamp, onPick }: { template: CvTemplate; active: boolean; stamp: unknown; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const pdf = usePdf(template.name, stamp, seen)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      aria-current={active ? 'true' : undefined}
      className={`group flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70 ${active ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'border-border bg-transparent hover:border-muted-foreground'}`}
    >
      <div className="aspect-[8.5/11] w-full overflow-hidden rounded-sm bg-white shadow-sm">
        {pdf.url ? (
          <iframe tabIndex={-1} aria-hidden="true" src={`${pdf.url}#view=Fit&toolbar=0&navpanes=0&scrollbar=0`} title="" className="pointer-events-none h-full w-full border-0" />
        ) : pdf.error ? (
          <p className="m-0 p-3 text-xs text-muted-foreground">Preview unavailable: {pdf.error}</p>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>
      <span className="flex items-center justify-between gap-2 px-1 text-sm">
        <span className="min-w-0 truncate font-medium text-foreground" title={template.displayName}>{template.displayName}</span>
        <span className={`shrink-0 text-xs ${active ? 'font-medium text-brand-text' : 'text-muted-foreground'}`}>{active ? 'In use' : template.builtin ? 'Built-in' : 'Custom'}</span>
      </span>
    </button>
  )
}

export function TemplateGallery({ templates, active, stamp, onPick, onChanged }: {
  templates: CvTemplate[]
  active: string
  stamp: unknown
  onPick: (name: string) => void
  onChanged: () => void
}) {
  const { adopt } = useRuns()
  const [createOpen, setCreateOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState<'import' | 'create' | null>(null)

  const importTpl = () => act(async () => {
    setBusy('import')
    try { if (await careerloom.importTemplate()) onChanged() } finally { setBusy(null) }
  }, 'Template imported')
  const create = () => act(async () => {
    setBusy('create')
    try {
      adopt(await careerloom.createTemplate(description.trim()))
      setCreateOpen(false)
      setDescription('')
    } finally { setBusy(null) }
  }, 'The agent is designing your template')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="m-0 flex-1 text-sm text-muted-foreground">Each preview is your résumé in that template. Pick one to view it full size.</p>
        <Button size="sm" variant="outline" className="border-border" disabled={busy === 'import'} onClick={() => void importTpl()}>{busy === 'import' ? 'Importing…' : 'Import template'}</Button>
        <Button size="sm" variant="outline" className="border-border" onClick={() => setCreateOpen(true)}>Create with AI</Button>
      </div>
      {templates.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Couldn't list templates. career-ops may need <code>npm install</code> — open Integrations, career-ops, Check.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {templates.map(t => <Thumb key={t.name} template={t} active={t.name === active} stamp={stamp} onPick={() => onPick(t.name)} />)}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a template with AI</DialogTitle>
            <DialogDescription>Describe the look you want. The agent writes a new HTML template you can preview here.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A compact single-column layout with a bold header band and small caps section titles"
            rows={5}
            aria-label="Template description"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!description.trim() || busy === 'create'} onClick={() => void create()}>{busy === 'create' ? 'Starting…' : 'Create template'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
