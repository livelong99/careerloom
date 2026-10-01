import { ArrowDown, ArrowUp, Pin } from 'lucide-react'
import { type KeyboardEvent, useRef } from 'react'

import { Badge } from '@/components/ui/badge'

import type { KbItemView, Provenance } from '../../../electron/kb/types'
import { THREAD } from './format'
import { ORIGIN_LABEL, type SortKey, TYPE_LABEL } from './filter'
import { Level } from './Level'

const TYPE_TONE: Record<string, 'info' | 'violet' | 'brand' | 'warn' | 'neutral'> = { technical: 'info', 'system-design': 'violet', behavioural: 'brand', situational: 'warn' }
const ORIGIN_TONE: Record<Provenance, 'success' | 'warn' | 'info'> = { sourced: 'success', generated: 'warn', user: 'info' }
const th = 'whitespace-normal! p-2! text-left! text-xs! font-medium text-muted-foreground bg-muted/40 border-b border-border'

const originLine = (i: KbItemView): string => (i.provenance === 'user' ? 'Added by you' : i.provenance === 'generated' ? 'No source — practice only' : `${i.sourceCount} ${i.sourceCount === 1 ? 'source' : 'sources'}`)

type Props = {
  items: KbItemView[]; skillName: (id: string) => string; selectedId: string | null; onOpen: (id: string) => void
  sort: { key: SortKey; dir: 1 | -1 }; onSort: (key: SortKey) => void
}

export function BankTable({ items, skillName, selectedId, onOpen, sort, onSort }: Props) {
  const body = useRef<HTMLTableSectionElement>(null)
  const move = (e: KeyboardEvent<HTMLTableRowElement>, id: string): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id) }
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const rows = [...body.current!.querySelectorAll<HTMLElement>('tr')]
    rows[rows.indexOf(e.currentTarget) + d]?.focus()
  }
  const head = (key: SortKey, label: string, w?: string) => {
    const on = sort.key === key
    return (
      <th scope="col" className={th} style={{ width: w }} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        {key === 'default' ? label : (
          <button type="button" onClick={() => onSort(key)} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-[inherit] text-[inherit] text-inherit hover:text-foreground">
            {label}{on && (sort.dir === 1 ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)}
          </button>
        )}
      </th>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full table-fixed border-collapse" aria-label="Interview questions">
        <thead><tr>{head('default', 'Question')}{head('type', 'Type', '112px')}{head('level', 'Level', '76px')}{head('origin', 'Origin', '92px')}</tr></thead>
        <tbody ref={body}>
          {items.map(i => (
            <tr key={i.id} tabIndex={0} aria-selected={selectedId === i.id} onClick={() => onOpen(i.id)} onKeyDown={e => move(e, i.id)}
              className={`cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === i.id ? '[&>td]:bg-primary/[0.08]' : ''} ${i.user.hidden ? 'opacity-45' : ''}`}>
              <td className={`relative border-b border-border/60 p-2.5! pl-4! align-top whitespace-normal! before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] ${THREAD[i.provenance]}`}>
                <div className="text-[13.5px] font-semibold leading-snug">
                  {i.user.pinned && <Pin aria-label="Pinned" className="mr-1 inline size-3.5 align-[-2px] text-[var(--thread-text)]" />}{i.text}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                  {i.skills.slice(0, 2).map(s => <Badge key={s} variant="neutral">{skillName(s)}</Badge>)}
                  <span>{originLine(i)}</span>
                  {i.seen > 1 && <span>· seen in {i.seen} sources</span>}
                  {i.user.hidden && <span>· hidden</span>}
                </div>
              </td>
              <td className="border-b border-border/60 p-2.5! align-top whitespace-normal!"><Badge variant={TYPE_TONE[i.type] ?? 'neutral'}>{TYPE_LABEL[i.type]}</Badge></td>
              <td className="border-b border-border/60 p-2.5! align-top whitespace-normal!"><Level n={i.difficulty} /></td>
              <td className="border-b border-border/60 p-2.5! align-top whitespace-normal!"><Badge variant={ORIGIN_TONE[i.provenance]}>{ORIGIN_LABEL[i.provenance]}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
