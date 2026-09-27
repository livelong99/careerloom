import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import type { Portal } from '../../lib/types'
import { boardType, TYPE_LABEL, TYPE_ORDER } from './boardType'

type Props = { portals: Portal[]; busy: boolean; onClose: () => void; onStart: (ids: string[], all: boolean) => void }

const defaultPick = (p: Portal) => p.enabled && p.fetch !== 'browser'

/** Pick boards (enabled ones pre-checked; browser boards opt-in) and start one scan. */
export function NewScanDialog({ portals, busy, onClose, onStart }: Props) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(portals.filter(defaultPick).map(p => p.id)))
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const groups = TYPE_ORDER.map(t => ({ t, rows: portals.filter(p => boardType(p) === t && (!q || p.name.toLowerCase().includes(q))) })).filter(g => g.rows.length)
  const toggle = (ids: string[], on: boolean) => setPicked(prev => { const next = new Set(prev); ids.forEach(id => (on ? next.add(id) : next.delete(id))); return next })
  const isDefault = portals.every(p => picked.has(p.id) === defaultPick(p))

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New scan</DialogTitle>
          <DialogDescription>Enabled boards are selected. Progress shows in Runs; the result lands in Scans and new jobs on the Jobs screen.</DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter boards" aria-label="Filter boards" className="h-8" />
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {groups.map(g => {
            const ids = g.rows.map(p => p.id)
            const on = ids.filter(id => picked.has(id)).length
            return (
              <div key={g.t} role="group" aria-label={TYPE_LABEL[g.t]} className="border-b border-border last:border-0">
                <label className="flex cursor-pointer items-center gap-2 bg-(--hover) px-3 py-1.5 text-xs font-medium">
                  <Checkbox checked={on === ids.length ? true : on ? 'indeterminate' : false} onCheckedChange={v => toggle(ids, Boolean(v))} aria-label={`All ${TYPE_LABEL[g.t]}`} />
                  {TYPE_LABEL[g.t]} <span className="tabular-nums text-muted-foreground">{on}/{ids.length}</span>
                </label>
                {g.t === 'browser' && (
                  <p className="px-3 pt-1.5 text-xs text-muted-foreground">Read in Chrome with your login — sites like LinkedIn restrict automated access; you’ll confirm once per site. Only scanned when checked here.</p>
                )}
                <ul className="m-0 list-none p-0">
                  {g.rows.map(p => (
                    <li key={p.id}>
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 px-3 py-1 text-sm hover:bg-(--hover)">
                        <Checkbox checked={picked.has(p.id)} onCheckedChange={v => toggle([p.id], Boolean(v))} />
                        <span className={`flex-1 truncate${p.enabled ? '' : ' text-muted-foreground'}`}>{p.name}</span>
                        {!p.enabled && <span className="text-xs text-muted-foreground">disabled</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        <DialogFooter className="items-center gap-2">
          <span className="mr-auto text-xs tabular-nums text-muted-foreground">{picked.size} of {portals.length} boards</span>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || picked.size === 0} onClick={() => onStart([...picked], isDefault)}>{busy ? 'Starting…' : `Scan ${picked.size} board${picked.size === 1 ? '' : 's'}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
