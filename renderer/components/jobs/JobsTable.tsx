import { useMemo, useState } from 'react'
import { flexRender, type ColumnVisibilityState, type RowSelectionState, type SortingState } from '@tanstack/react-table'
import { getCoreRowModel, getSortedRowModel, useLegacyTable, type LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { ChevronDown, ChevronUp, Columns3 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { Portal } from '../../lib/types'
import { ScoreBadge } from '../Badges'
import { EmptyNote } from '../EmptyState'
import { HitCheckbox } from '../kit/HitCheckbox'
import { postedOf, stateLabel, type ScreenedJob } from './filters'
import { QuickFeedback, ScreenBadge } from './prescreen'

const PAGE = 300
const BUCKET_RANK = { likely: 3, uncertain: 2, unlikely: 1 } as const
/** Sort key: bucket first, model fit within it; unscreened last. */
const screenRank = (j: ScreenedJob) => (j.screen ? BUCKET_RANK[j.screen.bucket] + (j.screen.fit ?? 0.5) / 2 : 0)
const DAY = 86_400_000

/** "3d ago" with the ISO date in the tooltip; never wraps. */
function RelDate({ iso }: { iso: string }) {
  if (!iso) return <span className="text-muted-foreground">—</span>
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY)
  const rel = Number.isNaN(days) ? iso : days <= 0 ? 'Today' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`
  return <time dateTime={iso} title={iso} className="whitespace-nowrap tabular-nums">{rel}</time>
}

export function StatePill({ job }: { job: ScreenedJob }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`stage stage-${job.state}`}>{job.status && job.state !== 'evaluated' ? job.status : stateLabel(job.state)}</span>
      {job.stale && <span className="stage" title="Evaluated before your résumé last changed — re-evaluate">Stale</span>}
    </span>
  )
}

function SortHeader({ label, sorted, onClick }: { label: string; sorted: false | 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--accent-text)" onClick={onClick}>
      {label}
      {sorted === 'asc' && <ChevronUp className="h-3 w-3" />}
      {sorted === 'desc' && <ChevronDown className="h-3 w-3" />}
    </button>
  )
}

function makeColumns(portals: Portal[], onScreened: () => void): ColumnDef<ScreenedJob>[] {
  const portalName = (id: string | null) => (id ? portals.find(p => p.id === id)?.name ?? '—' : 'Pasted')
  return [
    {
      id: 'select', enableSorting: false, enableHiding: false,
      header: ({ table }) => (
        <HitCheckbox
          checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={v => table.toggleAllRowsSelected(Boolean(v))} aria-label="Select all shown jobs"
        />
      ),
      cell: ({ row }) => <HitCheckbox checked={row.getIsSelected()} onCheckedChange={v => row.toggleSelected(Boolean(v))} aria-label={`Select ${row.original.title}`} />,
    },
    {
      id: 'title', header: 'Title', accessorFn: j => j.title, enableHiding: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium" title={row.original.title || undefined}>{row.original.title || 'Untitled posting'}</div>
          <div className="truncate text-xs text-muted-foreground" title={row.original.company || undefined}>{row.original.company || '—'}</div>
        </div>
      ),
    },
    { id: 'screen', header: 'Pre-screen', accessorFn: screenRank, sortDescFirst: true, cell: ({ row }) => <span className="inline-flex items-center gap-1"><ScreenBadge entry={row.original.screen} /><QuickFeedback job={row.original} onChange={onScreened} /></span> },
    { id: 'portal', header: 'Portal', accessorFn: j => portalName(j.portalId), cell: ({ row, getValue }) => <span className={row.original.portalId ? 'whitespace-nowrap' : 'whitespace-nowrap text-muted-foreground'}>{getValue<string>()}</span> },
    { id: 'location', header: 'Location', accessorFn: j => j.location ?? '—', cell: ({ getValue }) => <LocationCell value={getValue<string>()} /> },
    { id: 'posted', header: 'Posted', accessorFn: postedOf, cell: ({ getValue }) => <RelDate iso={getValue<string>()} /> },
    { accessorKey: 'score', header: 'Fit', sortUndefined: 'last', cell: ({ getValue, row }) => <ScoreBadge score={getValue<number | null>()} quick={row.original.quick} /> },
    { id: 'state', header: 'State', accessorFn: j => j.state, cell: ({ row }) => <StatePill job={row.original} /> },
    { id: 'evaluated', header: 'Evaluated', accessorFn: j => j.evaluatedAt ?? '', cell: ({ getValue }) => <RelDate iso={getValue<string>()} /> },
  ]
}

type Props = {
  jobs: ScreenedJob[]
  portals: Portal[]
  onOpen: (job: ScreenedJob) => void
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onScreened: () => void
}

/** Sortable, selectable job table (TanStack legacy shim, as the old Pipeline table used). */
export function JobsTable({ jobs, portals, onOpen, selected, onSelectedChange, onScreened }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'posted', desc: true }])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [limit, setLimit] = useState(PAGE)
  const columns = useMemo(() => makeColumns(portals, onScreened), [portals, onScreened])
  const rowSelection = useMemo(() => Object.fromEntries(selected.map(id => [id, true])) as RowSelectionState, [selected])

  const table = useLegacyTable({
    data: jobs, columns,
    state: { sorting, columnVisibility, rowSelection },
    getRowId: row => row.id,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: updater => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      onSelectedChange(Object.keys(next).filter(k => next[k]))
    },
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (jobs.length === 0) return <EmptyNote>No jobs match these filters. Remove a filter or clear them all.</EmptyNote>
  const rows = table.getRowModel().rows

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">{jobs.length} job{jobs.length === 1 ? '' : 's'}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal"><Columns3 className="h-3.5 w-3.5" /> Columns</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllLeafColumns().filter(c => c.getCanHide()).map(column => (
              <DropdownMenuItem key={column.id} onSelect={e => e.preventDefault()} className="gap-2">
                <Checkbox checked={column.getIsVisible()} onCheckedChange={v => column.toggleVisibility(Boolean(v))} />
                {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="fill-scroll">
      <Table className="tbl">
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id}>
              {group.headers.map(header => (
                <TableHead key={header.id} aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
                  {header.isPlaceholder ? null : header.column.getCanSort()
                    ? <SortHeader label={String(flexRender(header.column.columnDef.header, header.getContext()))} sorted={header.column.getIsSorted()} onClick={() => header.column.toggleSorting()} />
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.slice(0, limit).map(row => (
            <TableRow
              key={row.id} tabIndex={0} data-state={row.getIsSelected() ? 'selected' : undefined}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent-text)"
              onClick={() => onOpen(row.original)}
              onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(row.original) }}
            >
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id} className={cell.column.id === 'title' ? 'max-w-80' : undefined} onClick={cell.column.id === 'select' ? e => e.stopPropagation() : undefined}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > limit && (
        <div className="flex justify-center p-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}</Button>
        </div>
      )}
      </div>
    </div>
  )
}

/** Multi-site postings ("Remote, Canada; Remote, UK; …") show the first site + a count; the full list is in the tooltip. */
function LocationCell({ value }: { value: string }) {
  const parts = value.split(';').map(s => s.trim()).filter(Boolean)
  return (
    <span className="block max-w-[10rem] truncate" title={parts.length > 1 ? parts.join('\n') : value}>
      {parts[0] ?? value}{parts.length > 1 && <span className="text-muted-foreground"> +{parts.length - 1}</span>}
    </span>
  )
}
