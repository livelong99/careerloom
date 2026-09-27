import { Fragment, useMemo, useState } from 'react'
import { PencilLine, Plus, Search, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { Portal } from '../../lib/types'
import { EmptyNote } from '../EmptyState'
import { HitCheckbox } from '../kit/HitCheckbox'
import { AddWebBoardDialog } from '../jobs/AddWebBoardDialog'
import { DeletePortalsDialog } from '../jobs/PortalDialogs'
import { SegTabs } from '../SegTabs'
import { ago, boardType, hostOf, TYPE_LABEL, TYPE_ORDER, type BoardType } from './boardType'

type Props = { portals: Portal[]; onEdit: (id: string) => void; onChanged: () => void; onScan: (ids: string[]) => void; scanning: boolean }
type StatusFilter = 'all' | 'enabled' | 'disabled'

const HEALTH_TONE: Record<string, 'success' | 'warn' | 'danger' | 'neutral'> = { reachable: 'success', empty: 'warn', unreachable: 'danger', error: 'danger' }

/** Every board, grouped by type: search, filters, inline enable, bulk scan/enable/disable/delete. */
export function BoardsTable({ portals, onEdit, onChanged, onScan, scanning }: Props) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<BoardType | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState<Portal[] | null>(null)
  const [adding, setAdding] = useState(false)

  const counts = useMemo(() => Object.fromEntries(TYPE_ORDER.map(t => [t, portals.filter(p => boardType(p) === t).length])) as Record<BoardType, number>, [portals])
  const q = query.trim().toLowerCase()
  const shown = portals.filter(p =>
    (type === 'all' || boardType(p) === type)
    && (status === 'all' || (status === 'enabled') === p.enabled)
    && (!q || `${p.name} ${p.ats ?? ''} ${p.careersUrl ?? ''}`.toLowerCase().includes(q)))
  const groups = TYPE_ORDER.map(t => ({ t, rows: shown.filter(p => boardType(p) === t) })).filter(g => g.rows.length)
  const picked = portals.filter(p => selected.includes(p.id))
  const allShown = shown.length > 0 && shown.every(p => selected.includes(p.id))

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); showToast(ok); onChanged() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  const setEnabled = (ids: string[], enabled: boolean) => act(() => careerloom.setPortalsEnabled(ids, enabled), `${enabled ? 'Enabled' : 'Disabled'} ${ids.length === 1 ? portals.find(p => p.id === ids[0])?.name ?? '1 board' : `${ids.length} boards`}`)
  const addDefaults = () => act(async () => {
    const n = await careerloom.addDefaultPortals()
    if (!n) throw new Error('You already have all the default boards')
  }, 'Added the default boards (each keeps career-ops’ enabled flag; browser presets start disabled)')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search boards" aria-label="Search boards" className="h-8 pl-8 text-sm" />
        </div>
        <SegTabs
          value={type} onChange={v => setType(v as BoardType | 'all')}
          options={[{ value: 'all', label: `All ${portals.length}` }, ...TYPE_ORDER.filter(t => counts[t]).map(t => ({ value: t, label: `${TYPE_LABEL[t]} ${counts[t]}` }))]}
        />
        <SegTabs value={status} onChange={v => setStatus(v as StatusFilter)} options={[{ value: 'all', label: 'Any status' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} />
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1"><Plus className="h-3.5 w-3.5" aria-hidden /> Add board</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAdding(true)}>ATS link or any job board…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void addDefaults()}>Add default boards</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {picked.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-(--line) bg-(--panel) px-3 py-1.5 text-sm" role="toolbar" aria-label="Selected boards">
          <span className="tabular-nums">{picked.length} selected</span>
          <Button size="sm" variant="secondary" className="h-8" disabled={scanning} onClick={() => onScan(picked.map(p => p.id))}>Scan</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => void setEnabled(picked.map(p => p.id), true)}>Enable</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => void setEnabled(picked.map(p => p.id), false)}>Disable</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected([])}>Clear</Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleting(picked)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
          </Button>
        </div>
      )}

      {shown.length === 0
        ? <EmptyNote>{portals.length ? 'No boards match — clear the search or filters.' : 'No boards yet — use Add board.'}</EmptyNote>
        : (
          <div className="fill-scroll">
            <Table className="tbl">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <HitCheckbox checked={allShown ? true : selected.length ? 'indeterminate' : false} aria-label="Select all shown boards" onCheckedChange={v => setSelected(v ? shown.map(p => p.id) : [])} />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>Last&nbsp;scanned</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(g => (
                  <Fragment key={g.t}>
                    {type === 'all' && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={10} className="bg-(--hover) py-1 text-xs font-medium text-muted-foreground">{TYPE_LABEL[g.t]} · <span className="tabular-nums">{g.rows.length}</span></TableCell>
                      </TableRow>
                    )}
                    {g.rows.map(p => (
                      <TableRow
                        key={p.id} tabIndex={0} data-state={selected.includes(p.id) ? 'selected' : undefined}
                        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent-text)"
                        onClick={() => onEdit(p.id)}
                        onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onEdit(p.id) }}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <HitCheckbox checked={selected.includes(p.id)} aria-label={`Select ${p.name}`} onCheckedChange={() => setSelected(s => (s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id]))} />
                        </TableCell>
                        <TableCell className="max-w-64">
                          <div className={`truncate font-medium${p.enabled ? '' : ' text-muted-foreground'}`} title={p.name}>{p.name}</div>
                          {p.ats && <div className="truncate text-xs text-muted-foreground">{p.ats}</div>}
                        </TableCell>
                        <TableCell><Badge variant={g.t === 'browser' ? 'warn' : g.t === 'web' ? 'info' : 'neutral'}>{TYPE_LABEL[g.t]}</Badge></TableCell>
                        <TableCell className="max-w-56"><span className="block truncate text-muted-foreground" title={p.careersUrl ?? undefined}>{hostOf(p.careersUrl) || '—'}</span></TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <ToggleSwitch checked={p.enabled} aria-label={`${p.enabled ? 'Disable' : 'Enable'} ${p.name}`} onCheckedChange={v => void setEnabled([p.id], v)} />
                        </TableCell>
                        <TableCell className="tabular-nums">{p.jobCount}</TableCell>
                        <TableCell className="tabular-nums">{p.newCount > 0 ? <span className="font-medium text-(--accent-text)">+{p.newCount}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground" title={p.checkedAt ?? p.lastSeen ?? undefined}>{ago(p.checkedAt ?? p.lastSeen)}</TableCell>
                        <TableCell>{p.health ? <Badge variant={HEALTH_TONE[p.health] ?? 'neutral'}>{p.health}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${p.name}`} onClick={() => onEdit(p.id)}><PencilLine className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Delete ${p.name}`} onClick={() => setDeleting([p])}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      {adding && <AddWebBoardDialog onClose={() => setAdding(false)} onAdded={onChanged} />}
      {deleting && (
        <DeletePortalsDialog
          portals={deleting} onClose={() => setDeleting(null)}
          onDeleted={() => { setSelected(s => s.filter(id => !deleting.some(p => p.id === id))); onChanged() }}
        />
      )}
    </div>
  )
}
