import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import type { Difficulty, KbCoverage, KbQuestionType } from '../../../electron/kb/types'
import { selectCls } from './BankFilters'
import { TYPE_LABEL } from './filter'

export type ItemDraft = { text: string; type: KbQuestionType; skills: string[]; difficulty: Difficulty }
const TYPES = Object.keys(TYPE_LABEL) as KbQuestionType[]
const MAX = 300

type Props = { open: boolean; onOpenChange: (o: boolean) => void; initial?: ItemDraft; coverage: KbCoverage[]; onSave: (d: ItemDraft) => Promise<void> }

/** Add a question of your own, or edit one (design §8). Keyed by the caller so each open starts from `initial`. */
export function ItemDialog({ open, onOpenChange, initial, coverage, onSave }: Props) {
  const [d, setD] = useState<ItemDraft>(initial ?? { text: '', type: 'behavioural', skills: [], difficulty: 3 })
  const [busy, setBusy] = useState(false)
  const ok = d.text.trim().length >= 8 && d.text.length <= MAX
  const toggle = (id: string): void => setD(x => ({ ...x, skills: x.skills.includes(id) ? x.skills.filter(s => s !== id) : [...x.skills, id] }))
  const save = async (): Promise<void> => { setBusy(true); try { await onSave({ ...d, text: d.text.trim() }); onOpenChange(false) } finally { setBusy(false) } }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit question' : 'Add a question'}</DialogTitle>
          <DialogDescription>{initial ? 'Your edit is kept when the base is refreshed.' : 'It joins this job’s bank, labelled as yours.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">Question
            <Textarea value={d.text} maxLength={MAX} rows={3} onChange={e => setD({ ...d, text: e.target.value })} placeholder="e.g. How would you migrate a payments table with no downtime?" />
            <span className="text-xs text-muted-foreground">{d.text.length} / {MAX}</span>
          </label>
          <div className="flex gap-3">
            <label className="grid flex-1 gap-1">Type
              <select className={selectCls} value={d.type} onChange={e => setD({ ...d, type: e.target.value as KbQuestionType })}>{TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
            </label>
            <label className="grid flex-1 gap-1">Difficulty
              <select className={selectCls} value={d.difficulty} onChange={e => setD({ ...d, difficulty: Number(e.target.value) as Difficulty })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} of 5</option>)}</select>
            </label>
          </div>
          {coverage.length > 0 && (
            <div role="group" aria-label="Skills" className="flex flex-wrap gap-1.5">
              {coverage.map(c => <button key={c.skillId} type="button" aria-pressed={d.skills.includes(c.skillId)} onClick={() => toggle(c.skillId)}
                className={`h-7 cursor-pointer rounded-full border px-2.5 text-[12.5px] font-medium ${d.skills.includes(c.skillId) ? 'border-primary bg-primary/[0.12] text-brand-text' : 'border-border bg-card'}`}>{c.name}</button>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!ok || busy} onClick={() => void save()}>{initial ? 'Save changes' : 'Add question'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
