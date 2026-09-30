import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { PracticeQuestion } from '@/lib/types'
import { Group } from './Group'
import { TYPE_LABEL, TYPE_TONE } from './sessionsFormat'

const note = (q: PracticeQuestion): string =>
  `${q.source === 'report' ? 'From the report' : q.id.startsWith('own-') ? 'Your own' : 'Standard question'} · ${q.lastScore === null ? 'not tried yet' : `last try ${q.lastScore.toFixed(1)} / 5`}`

export function QuestionList({ company, questions, picked, onPick, onAdd }: { company: string; questions: PracticeQuestion[]; picked: Set<string>; onPick: (id: string, on: boolean) => void; onAdd: (text: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const submit = (): void => { const t = text.trim(); if (t) { onAdd(t); setText(''); setAdding(false) } }
  return (
    <Group title={`Questions for ${company}`} action={<>
      <Badge>{picked.size} selected</Badge>
      <Button size="sm" variant="outline" onClick={() => setAdding(a => !a)}><Plus className="size-3.5" aria-hidden />Add your own</Button>
    </>}>
      {adding && (
        <form className="mb-3 flex gap-2" onSubmit={e => { e.preventDefault(); submit() }}>
          <Input autoFocus aria-label="Your own question" value={text} maxLength={300} onChange={e => setText(e.target.value)} placeholder="Type a question you expect…" />
          <Button type="submit" disabled={!text.trim()}>Add</Button>
        </form>
      )}
      <ul className="m-0 grid list-none gap-2 p-0">
        {questions.map(q => (
          <li key={q.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <Checkbox className="mt-0.5" checked={picked.has(q.id)} onCheckedChange={v => onPick(q.id, v === true)} aria-label={q.text} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{q.text}</span><span className="text-xs text-muted-foreground">{note(q)}</span></span>
              <Badge variant={TYPE_TONE[q.type]}>{TYPE_LABEL[q.type]}</Badge>
            </label>
          </li>
        ))}
      </ul>
    </Group>
  )
}
