import { EyeOff, Eye, ExternalLink, Pin, PinOff, Play, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { KbItemDetail } from '../../../electron/kb/types'
import { ORIGIN_LABEL, TYPE_LABEL } from './filter'
import { Level } from './Level'

const H = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => <h5 className="mb-1.5 mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">{children}{extra}</h5>
const List = ({ items }: { items: string[] }) => <ul className="m-0 list-disc space-y-0.5 pl-[18px]">{items.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}</ul>

type Props = {
  item: KbItemDetail; onClose: () => void; onPin: () => void; onHide: () => void; onEdit: () => void; onPractise: () => void; onRemove: () => void; onOpenSource: (id: string) => void
}

/** Docked detail pane: question, why it matters to you, sources, generated outline, rubric, follow-ups, history. Esc closes. */
export function ItemSheet({ item, onClose, onPin, onHide, onEdit, onPractise, onRemove, onOpenSource }: Props) {
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => { head.current?.focus() }, [item.id])
  const { user, stats } = item
  return (
    <aside role="complementary" aria-label="Question detail" className="overflow-auto border-l border-border bg-card px-[18px] pb-6 pt-4 text-[13px]">
      <div className="flex items-center gap-1.5">
        <Badge variant="violet">{TYPE_LABEL[item.type]}</Badge>
        <Badge variant={item.provenance === 'sourced' ? 'success' : item.provenance === 'generated' ? 'warn' : 'info'}>{ORIGIN_LABEL[item.provenance]}</Badge>
        <Level n={item.difficulty} />
        <span className="flex-1" />
        <Button size="icon" variant="ghost" aria-label="Close detail" onClick={onClose}><X aria-hidden /></Button>
      </div>
      <h3 ref={head} tabIndex={-1} className="mb-2 mt-2 text-base font-bold leading-snug outline-none">{item.text}</h3>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" aria-pressed={user.pinned} onClick={onPin}>{user.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}{user.pinned ? 'Unpin' : 'Pin'}</Button>
        <Button size="sm" variant="outline" onClick={onHide}>{user.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}{user.hidden ? 'Unhide' : 'Hide'}</Button>
        <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
        {item.provenance === 'user' && <Button size="sm" variant="outline" onClick={onRemove}>Delete</Button>}
        <Button size="sm" onClick={onPractise}><Play aria-hidden />Practise this</Button>
      </div>

      {item.whyForYou && <><H>Why this one for you</H><div className="rounded-md border border-[color-mix(in_srgb,var(--thread)_35%,transparent)] bg-[color-mix(in_srgb,var(--thread)_10%,var(--card))] px-3 py-2.5">{item.whyForYou}</div></>}

      {item.sources.length > 0 && <>
        <H>Sources ({item.sources.length})</H>
        {item.sources.map(({ source, note }) => (
          <button key={source.id} type="button" onClick={() => onOpenSource(source.id)} aria-label={`Open source: ${source.title} (opens in your browser)`}
            className="mb-1.5 flex w-full cursor-pointer items-start gap-2 rounded-md border border-border bg-transparent px-2.5 py-2 text-left font-[inherit] text-[inherit] hover:bg-muted/50">
            <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><b className="block font-semibold">{source.title}</b><span className="text-xs text-muted-foreground">{source.host}{source.licence ? ` · ${source.licence}` : ''} · {note}</span></span>
          </button>
        ))}
      </>}

      {item.idealOutline.length > 0 && <><H extra={<Badge variant="warn">Generated</Badge>}>Suggested outline</H><List items={item.idealOutline} /></>}
      {item.rubric.length > 0 && <>
        <H>What a good answer shows</H>
        <dl className="m-0 grid grid-cols-[96px_1fr_1fr] gap-x-2.5 gap-y-1.5 text-[12.5px]">
          <dt aria-hidden /><dd className="m-0 text-[11.5px] text-muted-foreground">Strong</dd><dd className="m-0 text-[11.5px] text-muted-foreground">Weak</dd>
          {item.rubric.flatMap(r => [<dt key={`${r.criterion}c`} className="font-semibold">{r.criterion}</dt>, <dd key={`${r.criterion}g`} className="m-0">{r.good}</dd>, <dd key={`${r.criterion}w`} className="m-0">{r.weak}</dd>])}
        </dl>
      </>}
      {item.followUps.length > 0 && <><H>Likely follow-ups</H><List items={item.followUps} /></>}
      {item.redFlags.length > 0 && <><H>Red flags</H><List items={item.redFlags} /></>}
      <H>Your history</H>
      <span className="text-muted-foreground">{stats.asked ? `Asked ${stats.asked} ${stats.asked === 1 ? 'time' : 'times'}${stats.lastScore !== null ? ` · last score ${stats.lastScore.toFixed(1)} / 5` : ''}` : 'Not asked yet'}</span>
      {user.notes && <><H>Your notes</H><p className="m-0">{user.notes}</p></>}
    </aside>
  )
}
