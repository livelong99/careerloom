import { useEffect, useState } from 'react'

import { act } from '@/components/resume/actions'
import { joinCv, splitCv, type CvPart } from '@/components/resume/cvSections'
import { usePdf } from '@/components/resume/usePdf'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { careerloom } from '@/lib/ipc'
import type { CvDocument } from '@/lib/types'

import { Page } from './PageStub'
import type { ResumeCtx } from './ctx'

type Draft = { base: number; original: string; header: string; parts: CvPart[] }
// Unsaved edits outlive page switches (in memory only).
let kept: Draft | null = null
const fresh = (cv: CvDocument): Draft => ({ base: cv.updatedAt, original: cv.markdown, ...splitCv(cv.markdown) })
const HEADER = -1

/** Section list | editor | the PDF your template makes. The preview refreshes when you save. */
export function ContentPage({ ctx }: { ctx: ResumeCtx }) {
  const { cv } = ctx
  const [draft, setDraft] = useState<Draft | null>(() => kept ?? (cv ? fresh(cv) : null))
  const [sel, setSel] = useState<number>(HEADER)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const dirty = !!draft && joinCv(draft.header, draft.parts) !== draft.original
  const stale = dirty && !!cv && draft!.base !== cv.updatedAt
  const template = ctx.overview.activeTemplate ?? 'standard'
  const pdf = usePdf(draft ? template : null, `${cv?.updatedAt}:${ctx.profile?.extractedAt ?? 0}`)

  useEffect(() => { kept = dirty ? draft : null }, [draft, dirty])
  // Follow cv.md on disk (an Apply, an undo) while there is nothing unsaved to protect.
  useEffect(() => { if (cv && !dirty) setDraft(fresh(cv)) }, [cv?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cv || !draft) {
    return <Page title="Content" blurb="Edit your résumé text section by section."><p className="m-0 text-sm text-muted-foreground">No cv.md yet. Add a résumé on the Overview page and extract it to start editing.</p></Page>
  }

  if (sel !== HEADER && sel >= draft.parts.length) setSel(HEADER) // sections shrank after a reload
  const body = sel === HEADER ? draft.header : draft.parts[sel]?.body ?? ''
  const title = sel === HEADER ? 'Name and headline' : draft.parts[sel]?.title ?? ''
  const edit = (v: string) => setDraft(d => d && (sel === HEADER ? { ...d, header: v } : { ...d, parts: d.parts.map((p, i) => (i === sel ? { ...p, body: v } : p)) }))
  const changed = (i: number) => (i === HEADER ? draft.header !== splitCv(draft.original).header : draft.parts[i]?.body !== splitCv(draft.original).parts[i]?.body)
  const discard = () => { kept = null; setDraft(fresh(cv)) }
  const save = () => act(async () => {
    setSaving(true)
    try {
      const doc = await careerloom.writeCv(joinCv(draft.header, draft.parts))
      kept = null
      setDraft(fresh(doc))
      ctx.refresh()
    } finally { setSaving(false) }
  }, 'Saved cv.md')

  return (
    <Page title="Content" blurb="Edit your résumé text section by section. The preview updates when you save.">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-muted-foreground" role="status">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        {dirty && <Button size="sm" variant="subtle" onClick={() => setConfirm(true)}>Discard</Button>}
        <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => void save()}>Save</Button>
      </div>
      {stale && <p role="alert" className="m-0 rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-foreground">cv.md changed on disk since you started editing. Saving replaces that version; discard to load it.</p>}
      <div className="h-[calc(100vh-330px)] min-h-[480px] rounded-xl border border-border">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="20%" minSize="14%">
            <nav aria-label="Sections" className="flex h-full flex-col gap-1 overflow-auto p-2">
              {[{ i: HEADER, t: 'Name and headline' }, ...draft.parts.map((p, i) => ({ i, t: p.title }))].map(({ i, t }) => (
                <Button key={`${i}-${t}`} variant={sel === i ? 'iconBtnActive' : 'subtle'} size="sm" className="justify-start" aria-current={sel === i ? 'true' : undefined} onClick={() => setSel(i)}>
                  <span className="truncate">{t}</span>{changed(i) && <span aria-label="edited" className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />}
                </Button>
              ))}
            </nav>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="42%" minSize="25%">
            <div className="flex h-full flex-col gap-2 p-3">
              <label htmlFor="cv-section" className="text-[13px] font-semibold text-foreground">{title}</label>
              <Textarea id="cv-section" className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed" value={body} onChange={e => edit(e.target.value)} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="38%" minSize="20%">
            <div className="flex h-full items-start justify-center overflow-auto bg-muted p-3">
              {pdf.error ? <p role="alert" className="m-0 text-sm text-muted-foreground">Could not render the preview: {pdf.error}</p>
                : pdf.url ? <iframe src={`${pdf.url}#toolbar=0&navpanes=0&view=FitH`} title="Preview of your résumé" className="block h-full w-full rounded-sm border-0 bg-white" />
                  : <Skeleton aria-label="Rendering your résumé" className="h-full w-full" />}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Discard your edits?</AlertDialogTitle><AlertDialogDescription>Your unsaved changes to cv.md will be lost.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={discard}>Discard</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}
