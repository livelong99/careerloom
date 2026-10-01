import { useState } from 'react'

import type { AtsAnswer, AtsQuestion } from '../../lib/types'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Textarea } from '../ui/textarea'

/** One control for one question; shared by the analysis round and the per-finding "Answer first". */
export function QuestionField({ q, value, onChange }: { q: AtsQuestion; value: string; onChange: (v: string) => void }) {
  const id = `q-${q.id}`
  return (
    <Field>
      <FieldLabel htmlFor={id}>{q.text}</FieldLabel>
      {q.why && <FieldDescription>{q.why}</FieldDescription>}
      {q.type === 'choice' && q.options?.length ? (
        <RadioGroup id={id} value={value} onValueChange={onChange} aria-label={q.text}>
          {q.options.map(o => <label key={o} className="flex min-h-6 items-center gap-2 text-sm"><RadioGroupItem value={o} />{o}</label>)}
        </RadioGroup>
      ) : q.type === 'number' ? (
        <Input id={id} type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <Textarea id={id} rows={2} value={value} onChange={e => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/** The agent stopped to ask: answer here, never in a toast. Empty answers are allowed (the agent is told "none"). */
export function QuestionsPanel({ questions, busy, onSend }: { questions: AtsQuestion[]; busy: boolean; onSend: (a: AtsAnswer[]) => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const answers = questions.map((q): AtsAnswer => ({ id: q.id, value: (values[q.id] ?? '').trim() || 'none' }))
  return (
    <Alert role="region" aria-label="Questions from the agent">
      <AlertTitle>The agent needs {questions.length === 1 ? 'one answer' : `${questions.length} answers`}</AlertTitle>
      <AlertDescription className="mt-3 flex flex-col gap-4">
        <p className="m-0">It can only rephrase facts that are in your résumé, so it asks before adding anything. Leave a box empty if the answer is no.</p>
        <FieldGroup>
          {questions.map(q => <QuestionField key={q.id} q={q} value={values[q.id] ?? ''} onChange={v => setValues(s => ({ ...s, [q.id]: v }))} />)}
        </FieldGroup>
        <Button variant="primary" className="self-start" disabled={busy} onClick={() => onSend(answers)}>{busy ? 'Sending…' : 'Send answers'}</Button>
      </AlertDescription>
    </Alert>
  )
}
