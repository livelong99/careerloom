import { useEffect, useState } from 'react'

import { careerloom } from '../../lib/ipc'
import type { CvDocument, ExtractedProfile } from '../../lib/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { act } from './actions'
import { joinCv, splitCv, type CvPart } from './cvSections'

type Draft = { base: number; original: string; header: string; parts: CvPart[] }
// Unsaved edits outlive tab switches and leaving the screen (in-memory only).
let kept: Draft | null = null

const fresh = (cv: CvDocument): Draft => ({ base: cv.updatedAt, original: cv.markdown, ...splitCv(cv.markdown) })

export function EditTab({ cv, profile, onSaved, onReExtract, onDirty }: {
  cv: CvDocument | null
  profile: ExtractedProfile | null
  onSaved: () => void
  onReExtract: (() => void) | null
  onDirty: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(() => kept ?? (cv ? fresh(cv) : null))
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<'discard' | 'reextract' | null>(null)
  const dirty = !!draft && joinCv(draft.header, draft.parts) !== draft.original
  const stale = dirty && !!cv && draft!.base !== cv.updatedAt

  useEffect(() => { kept = dirty ? draft : null; onDirty(dirty) }, [draft, dirty, onDirty])
  // Follow cv.md on disk while there is nothing unsaved to protect.
  useEffect(() => { if (cv && !dirty) setDraft(fresh(cv)) }, [cv?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cv || !draft) return <p className="m-0 text-sm text-muted-foreground">No cv.md yet. Add a résumé file and extract it to start editing.</p>

  const setPart = (i: number, body: string) => setDraft(d => d && { ...d, parts: d.parts.map((p, n) => (n === i ? { ...p, body } : p)) })
  const discard = () => { kept = null; setDraft(fresh(cv)) }
  const save = () => act(async () => {
    setSaving(true)
    try {
      const doc = await careerloom.writeCv(joinCv(draft.header, draft.parts))
      kept = null
      setDraft(fresh(doc))
      onSaved()
    } finally { setSaving(false) }
  }, 'Saved cv.md')

  const links = profile ? [profile.email, profile.phone, profile.location, ...profile.links.map(l => l.url)].filter(Boolean) : []

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-card py-1">
        <span className="flex-1 text-xs text-muted-foreground" role="status">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        {dirty && <Button size="sm" variant="subtle" onClick={() => setConfirm('discard')}>Discard</Button>}
        <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => void save()}>Save</Button>
      </div>
      {stale && (
        <p role="alert" className="m-0 rounded-md border border-warning/50 bg-warning/10 p-2 text-xs text-foreground">
          cv.md changed on disk since you started editing. Saving replaces that version; discard to load it.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cv-header" className="text-[13px] font-semibold text-foreground">Name and headline</label>
        <Textarea id="cv-header" className="min-h-0 font-mono text-xs" value={draft.header} onChange={e => setDraft({ ...draft, header: e.target.value })} />
      </div>
      {draft.parts.map((p, i) => (
        <div key={`${i}-${p.title}`} className="flex flex-col gap-1.5">
          <label htmlFor={`cv-part-${i}`} className="text-[13px] font-semibold text-foreground">{p.title}</label>
          <Textarea id={`cv-part-${i}`} className="min-h-0 font-mono text-xs leading-relaxed" value={p.body} onChange={e => setPart(i, e.target.value)} />
        </div>
      ))}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="m-0 text-[13px] font-semibold text-foreground">Contact and links</h3>
        {links.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-muted-foreground">{links.map(l => <li key={l} className="truncate">{l}</li>)}</ul>
        ) : (
          <p className="m-0 text-muted-foreground">Not extracted yet. Extraction fills these from your résumé file.</p>
        )}
        {onReExtract && <Button size="sm" variant="outline" className="self-start border-border" onClick={() => (dirty ? setConfirm('reextract') : onReExtract())}>Re-extract</Button>}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={o => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'reextract' ? 'Re-extract and lose your edits?' : 'Discard your edits?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'reextract'
                ? 'The agent rewrites cv.md from your source file. Your unsaved edits will be lost.'
                : 'Your unsaved changes to cv.md will be lost.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { discard(); if (confirm === 'reextract') onReExtract?.() }}>
              {confirm === 'reextract' ? 'Re-extract' : 'Discard'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
