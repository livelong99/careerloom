import { useEffect, useState } from 'react'
import { LayoutGrid, Radar } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { BoardEditor } from '../components/boards/BoardEditor'
import { BoardsTable } from '../components/boards/BoardsTable'
import { NewScanDialog } from '../components/boards/NewScanDialog'
import { ScansTable } from '../components/boards/ScansTable'
import { useStartScan } from '../components/boards/useStartScan'
import { EmptyNote } from '../components/EmptyState'
import { EmptyState } from '../components/kit/EmptyState'
import { Panel } from '../components/Panel'
import { SegTabs } from '../components/SegTabs'
import { SectionSkeleton } from '../components/Skeleton'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'

type Tab = 'boards' | 'scans'

/** Boards: every job source (companies, job boards, web/browser boards) with full editing, plus scan history and new scans. */
export function Boards({ focusId, onFocusHandled }: { focusId: string | null; onFocusHandled: () => void }) {
  const { generation } = useRuns()
  const portals = usePolled(() => careerloom.listPortals(), [generation], { intervalMs: 20_000 })
  const scans = usePolled(() => careerloom.listScans(), [generation], { intervalMs: 10_000 })
  const [tab, setTab] = useState<Tab>('boards')
  const [editing, setEditing] = useState<string | null>(null)
  const [newScan, setNewScan] = useState(false)
  const scan = useStartScan()

  useEffect(() => {
    if (!focusId) return
    setTab('boards')
    setEditing(focusId)
    onFocusHandled()
  }, [focusId, onFocusHandled])

  const refresh = () => { portals.refresh(); scans.refresh() }
  const start = async (ids: string[]) => { if (await scan.start(ids)) { setNewScan(false); setTab('scans'); scans.refresh() } }

  if (!portals.data) {
    if (portals.error) return <Panel title="Boards"><EmptyNote>{portals.error.message}</EmptyNote></Panel>
    return <SectionSkeleton label="Boards" rows={8} />
  }
  const list = portals.data
  const addDefaults = async () => {
    try { await careerloom.addDefaultPortals(); refresh() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }

  return (
    <div className="workspace workspace-fill flex flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3">
        <SegTabs
          value={tab} onChange={v => setTab(v as Tab)}
          options={[{ value: 'boards', label: `Boards ${list.length}` }, { value: 'scans', label: `Scans ${scans.data?.length ?? ''}`.trim() }]}
        />
        <div className="flex-1" />
        <Button size="sm" className="h-8 gap-1.5" disabled={scan.busy || list.length === 0} onClick={() => setNewScan(true)}>
          <Radar className="h-3.5 w-3.5" aria-hidden /> New scan
        </Button>
      </div>
      {scan.ui}
      {list.length === 0
        ? <EmptyState icon={LayoutGrid} title="No boards yet" message="Start with the India starter pack — 24 popular Indian job boards in Common, Tech, Finance and Consulting, disabled until you enable them — or add any job board by URL." action="Add India starter pack" onAction={() => void addDefaults()} hideActionIcon />
        : tab === 'boards'
          ? <BoardsTable portals={list} onEdit={setEditing} onChanged={refresh} onScan={ids => void start(ids)} scanning={scan.busy} />
          : scans.data
            ? <ScansTable scans={scans.data} onNewScan={() => setNewScan(true)} />
            : <SectionSkeleton label="Scans" rows={6} />}
      <BoardEditor id={editing} portal={list.find(p => p.id === editing)} onClose={() => setEditing(null)} onSaved={refresh} />
      {newScan && <NewScanDialog portals={list} busy={scan.busy} onClose={() => setNewScan(false)} onStart={(ids, all) => void start(all ? [] : ids)} />}
    </div>
  )
}
