import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { stageOf, type StageId } from '../../lib/stages'
import { showToast } from '../../lib/toast'
import type { Application, CanonicalStatus } from '../../lib/types'
import { ScoreBadge } from '../Badges'

type Column = { id: string; label: string; stages: StageId[]; status: CanonicalStatus }

const COLUMNS: Column[] = [
  { id: 'evaluated', label: 'Evaluated', stages: ['evaluated'], status: 'Evaluated' },
  { id: 'applied', label: 'Applied', stages: ['applied'], status: 'Applied' },
  { id: 'responded', label: 'Responded', stages: ['responded'], status: 'Responded' },
  { id: 'interview', label: 'Interview', stages: ['interview'], status: 'Interview' },
  { id: 'offer', label: 'Offer', stages: ['offer', 'hired'], status: 'Offer' },
  // Rejected/Discarded/Skip collapse into one column; dropping a card here
  // means "close it out" generically, so it lands on Discarded (your call),
  // not Rejected (theirs) — a coarser column can't tell which the user meant.
  { id: 'closed', label: 'Closed', stages: ['rejected', 'discarded', 'skip'], status: 'Discarded' },
]

const columnOf = (a: Application): string => COLUMNS.find(c => c.stages.includes(stageOf(a.status)))?.id ?? 'closed'

type Props = { apps: Application[]; onOpen: (app: Application) => void; onStatusChanged: () => void }

/** Kanban view: drag a card to a column to set its status (optimistic, with
 *  rollback + a toast on failure). Column structure adapted from paperclip's
 *  KanbanBoard, trimmed to plain column drops (no in-column reordering). */
export function PipelineBoard({ apps, onOpen, onStatusChanged }: Props) {
  const [activeNum, setActiveNum] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['closed']))
  // Optimistic column override while a move is in flight; cleared on failure
  // (rollback) or left in place until the next tracker refetch confirms it.
  const [moved, setMoved] = useState<Map<number, string>>(new Map())
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const grouped = useMemo(() => {
    const map = new Map<string, Application[]>(COLUMNS.map(c => [c.id, []]))
    for (const a of apps) map.get(moved.get(a.num) ?? columnOf(a))?.push(a)
    return map
  }, [apps, moved])

  const activeApp = apps.find(a => a.num === activeNum) ?? null

  const toggleCollapse = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  function handleDragEnd(event: DragEndEvent) {
    setActiveNum(null)
    const { active, over } = event
    if (!over) return
    const num = Number(active.id)
    const app = apps.find(a => a.num === num)
    const target = COLUMNS.find(c => c.id === over.id)
    if (!app || !target || columnOf(app) === target.id) return
    setMoved(prev => new Map(prev).set(num, target.id))
    careerloom.setStatus([num], target.status)
      .then(result => {
        if (result.failed.length > 0) {
          showToast(result.failed[0]!.error, 'error', 6000)
          setMoved(prev => { const next = new Map(prev); next.delete(num); return next })
        } else {
          showToast(`Moved #${num} to ${target.label}`)
          onStatusChanged()
        }
      })
      .catch((err: unknown) => {
        showToast(normalizeCliError(err).message, 'error', 6000)
        setMoved(prev => { const next = new Map(prev); next.delete(num); return next })
      })
  }

  return (
    <DndContext sensors={sensors} onDragStart={e => setActiveNum(Number(e.active.id))} onDragEnd={handleDragEnd}>
      <div className="pipeline-board">
        {COLUMNS.map(col => (
          <BoardColumn
            key={col.id}
            column={col}
            apps={grouped.get(col.id) ?? []}
            collapsed={collapsed.has(col.id)}
            onToggleCollapse={() => toggleCollapse(col.id)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>{activeApp && <BoardCard app={activeApp} overlay />}</DragOverlay>
    </DndContext>
  )
}

function BoardColumn({ column, apps, collapsed, onToggleCollapse, onOpen }: {
  column: Column; apps: Application[]; collapsed: boolean; onToggleCollapse: () => void; onOpen: (app: Application) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  if (collapsed) {
    return (
      <button
        type="button" ref={setNodeRef} onClick={onToggleCollapse}
        className={`board-column collapsed cursor-pointer focus-visible:outline-2 focus-visible:outline-(--accent-text)${isOver ? ' over' : ''}`}
        title={`${column.label}: ${apps.length}`} aria-expanded="false"
      >
        <span className="board-column-label">{column.label}</span>
        <span className="board-column-count">{apps.length}</span>
      </button>
    )
  }
  return (
    <div className="board-column">
      <div
        className="board-column-head cursor-pointer focus-visible:outline-2 focus-visible:outline-(--accent-text)" role="button" tabIndex={0} aria-expanded="true"
        aria-label={`${column.label}, ${apps.length} — collapse`} onClick={onToggleCollapse}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapse() } }}
      >
        <span className="board-column-label">{column.label}</span>
        <span className="board-column-count">{apps.length}</span>
      </div>
      <div ref={setNodeRef} className={`board-column-body${isOver ? ' over' : ''}`}>
        {apps.map(app => <BoardCard key={app.num} app={app} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

function BoardCard({ app, onOpen, overlay }: { app: Application; onOpen?: (app: Application) => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.num })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`board-card focus-visible:outline-2 focus-visible:outline-(--accent-text)${isDragging && !overlay ? ' dragging' : ''}`}
      // Pointer-only drag: dnd-kit's keyboard-drag instructions would mislead, so describe the
      // keyboard path instead (Table view + bulk "Set status").
      aria-roledescription="job card" aria-describedby={undefined}
      aria-label={`${app.role} at ${app.company}. Enter opens the report; change status from Table view.`}
      onClick={() => onOpen?.(app)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(app) } }}
    >
      <div className="board-card-company">{app.company}</div>
      <div className="board-card-role">{app.role}</div>
      <ScoreBadge score={app.score} />
    </div>
  )
}
