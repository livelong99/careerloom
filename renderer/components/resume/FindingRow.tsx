import { useState } from 'react'

import type { AtsAnswer, AtsFinding, AtsPreview, AtsQuestion } from '../../lib/types'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Checkbox } from '../ui/checkbox'
import { Item, ItemContent, ItemDescription, ItemTitle } from '../ui/item'
import { Field, FieldGroup, FieldLabel } from '../ui/field'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Skeleton } from '../ui/skeleton'
import { QuestionField } from './QuestionsPanel'

export type PreviewState = { state: 'loading' } | { state: 'ok'; preview: AtsPreview } | { state: 'needs'; unmet: string[] } | { state: 'error'; message: string }

const SEVERITY = { critical: ['danger', 'Critical'], major: ['warn', 'Major'], minor: ['neutral', 'Minor'], info: ['info', 'Info'] } as const
const CATEGORY: Record<AtsFinding['category'], string> = { parse: 'Parsing', keyword: 'Keywords', evidence: 'Evidence', bullet: 'Bullet', date: 'Dates', section: 'Sections', seniority: 'Seniority', skill: 'Skill' }

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2" role="group" aria-label="Change preview">
      <div className="min-w-0 rounded-md border border-destructive/30 bg-destructive/5 p-2"><p className="m-0 mb-1 font-medium text-destructive">Before</p><pre className="m-0 font-mono whitespace-pre-wrap text-foreground">{before || '(nothing)'}</pre></div>
      <div className="min-w-0 rounded-md border border-success/30 bg-success/5 p-2"><p className="m-0 mb-1 font-medium text-success">After</p><pre className="m-0 font-mono whitespace-pre-wrap text-foreground">{after || '(removed)'}</pre></div>
    </div>
  )
}

/** One finding: why it matters, the exact change, the fact check, and Apply / Skip / Answer first. */
export function FindingRow({ f, preview, questions, undoId, busy, onPreview, onApply, onSkip, onUndo, onGoContent }: {
  f: AtsFinding
  preview: PreviewState | undefined
  questions: AtsQuestion[]
  /** set when this finding was applied and can still be undone */
  undoId: string | null
  busy: boolean
  onPreview: (answers: AtsAnswer[]) => void
  onApply: (answers: AtsAnswer[], override: boolean) => Promise<string | null>
  onSkip: () => void
  onUndo: (undoId: string) => Promise<string | null>
  onGoContent: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [override, setOverride] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sev, sevLabel] = SEVERITY[f.severity]
  const answers = Object.entries(values).map(([id, value]): AtsAnswer => ({ id, value }))
  const needs = preview?.state === 'needs' ? preview.unmet : []
  // Keep the answered questions on screen after the change is shown, so an answer can still be changed.
  const asked = needs.length ? needs : Object.keys(values)
  const unanswered = asked.some(id => !(values[id] ?? '').trim() || (id.startsWith('have:') && values[id] === 'no'))
  const violations = preview?.state === 'ok' && !preview.preview.factCheck.ok ? preview.preview.factCheck.violations : []
  const closed = f.status !== 'open'

  const run = async (fn: () => Promise<string | null>) => setError(await fn())

  return (
    <Item variant="outline" className={`flex-col items-stretch gap-3 ${closed ? 'opacity-70' : ''}`} data-finding={f.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={sev}>{sevLabel}</Badge>
        <Badge variant="neutral">{CATEGORY[f.category]}</Badge>
        {f.status === 'applied' && <Badge variant="success">Applied</Badge>}
        {f.status === 'dismissed' && <Badge variant="neutral">Skipped</Badge>}
      </div>
      <ItemContent className="gap-1">
        <ItemTitle className="text-sm">{f.title}</ItemTitle>
        <ItemDescription className="line-clamp-none text-sm">{f.detail}</ItemDescription>
        {f.evidence && <p className="m-0 text-xs text-muted-foreground italic">{f.evidence}</p>}
      </ItemContent>

      {f.status === 'open' && f.apply && (
        <>
          {asked.length > 0 && (
            <FieldGroup className="gap-3 rounded-md bg-muted/40 p-3">
              <p className="m-0 text-xs font-medium text-foreground">Answer first</p>
              {asked.map(id => {
                if (id.startsWith('have:')) {
                  const skill = id.slice(5)
                  return (
                    <Field key={id}>
                      <FieldLabel>Have you really used {skill}?</FieldLabel>
                      <RadioGroup value={values[id] ?? ''} onValueChange={v => setValues(s => ({ ...s, [id]: v }))} aria-label={`Have you used ${skill}?`}>
                        <label className="flex min-h-6 items-center gap-2 text-sm"><RadioGroupItem value="yes" />Yes, I have used it</label>
                        <label className="flex min-h-6 items-center gap-2 text-sm"><RadioGroupItem value="no" />No, not yet</label>
                      </RadioGroup>
                      {values[id] === 'no' && <p className="m-0 text-xs text-muted-foreground">Then leave it off. The Skill-up page shows how to build it first.</p>}
                    </Field>
                  )
                }
                const q = questions.find(x => x.id === id) ?? { id, text: `Your answer for "${id}"`, type: 'text' as const, why: '' }
                return <QuestionField key={id} q={q} value={values[id] ?? ''} onChange={v => setValues(s => ({ ...s, [id]: v }))} />
              })}
              <Button size="sm" variant="outline" className="self-start border-border" disabled={unanswered || busy} onClick={() => onPreview(answers)}>Show the change</Button>
            </FieldGroup>
          )}
          {preview?.state === 'loading' && <Skeleton aria-label="Preparing the change" className="h-14 w-full" />}
          {preview?.state === 'ok' && <Diff before={preview.preview.diff.before} after={preview.preview.diff.after} />}
          {preview?.state === 'ok' && violations.length === 0 && f.apply.op !== 'rebuild-profile' && <p className="m-0 text-xs text-muted-foreground">Fact check passed: nothing here is new to your résumé or your answers.</p>}
          {violations.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>This change adds facts that are not in your résumé</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <ul className="m-0 pl-4">{violations.map(v => <li key={v}>{v}</li>)}</ul>
                <label className="flex min-h-6 items-center gap-2 text-sm text-foreground"><Checkbox checked={override} onCheckedChange={c => setOverride(c === true)} />These are true, apply anyway</label>
              </AlertDescription>
            </Alert>
          )}
          {preview?.state === 'error' && <p role="alert" className="m-0 text-xs text-destructive">{preview.message}</p>}
        </>
      )}
      {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {f.status === 'open' && f.apply && (
          <ButtonGroup>
            <Button size="sm" variant="outline" className="border-border" disabled={busy || preview?.state !== 'ok' || (violations.length > 0 && !override)} onClick={() => void run(() => onApply(answers, override))}>
              {f.apply.op === 'rebuild-profile' ? 'Rebuild template data' : 'Apply'}
            </Button>
            <Button size="sm" variant="subtle" disabled={busy} onClick={onSkip}>Skip</Button>
          </ButtonGroup>
        )}
        {f.status === 'open' && !f.apply && (
          <>
            <span className="text-xs text-muted-foreground">No automatic change for this one.</span>
            <Button size="sm" variant="subtle" onClick={onGoContent}>Edit in Content</Button>
            <Button size="sm" variant="subtle" disabled={busy} onClick={onSkip}>Skip</Button>
          </>
        )}
        {f.status === 'applied' && undoId && <Button size="sm" variant="subtle" disabled={busy} onClick={() => void run(() => onUndo(undoId))}>Undo</Button>}
      </div>
    </Item>
  )
}
