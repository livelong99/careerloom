import { useMemo, useState } from 'react'
import { Plug, Plus, RefreshCw } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AddIntegrationDialog } from '../components/integrations/AddIntegrationDialog'
import { CategoryNav, type Category } from '../components/integrations/CategoryNav'
import { IntegrationDetailPanel } from '../components/integrations/IntegrationDetailPanel'
import { IntegrationTable } from '../components/integrations/IntegrationTable'
import { SetupSummary } from '../components/integrations/SetupSummary'
import { EmptyState } from '../components/kit/EmptyState'
import { Skeleton } from '../components/ui/skeleton'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'
import type { Integration, IntegrationAction, IntegrationDetail, Run } from '../lib/types'

function isRun(value: unknown): value is Run {
  return Boolean(value) && typeof value === 'object' && 'startedAt' in (value as object)
}

/** Integrations screen: career-ops skills, job sources, self-hosted services, and plugins. */
export function Integrations() {
  const { generation, adopt } = useRuns()
  const list = usePolled(() => careerloom.listIntegrations(), [generation], { intervalMs: 20_000, memoKey: 'integrations' })
  const items = list.data ?? []

  const [category, setCategory] = useState<Category>('all')
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState<IntegrationAction | null>(null)
  const [pendingRemove, setPendingRemove] = useState<Integration | null>(null)

  const detail = usePolled<IntegrationDetail>(
    () => careerloom.getIntegration(expandedId!),
    [expandedId],
    { intervalMs: null, enabled: expandedId !== undefined },
  )

  const counts = useMemo(() => {
    const base: Record<Category, number> = { all: items.length, skill: 0, source: 0, service: 0, plugin: 0 }
    for (const item of items) base[item.kind] += 1
    return base
  }, [items])

  const shown = category === 'all' ? items : items.filter(i => i.kind === category)

  const toggle = (id: string) => setExpandedId(prev => (prev === id ? undefined : id))

  const runAction = async (item: Integration, action: IntegrationAction) => {
    if (action === 'remove') { setPendingRemove(item); return }
    setBusy(action)
    try {
      const result = await careerloom.integrationAction(item.id, action)
      if (isRun(result)) { adopt(result); showToast(`Started: ${item.name} — ${action}`) }
      else showToast(`${item.name}: ${action} done`)
      void list.refresh()
      if (expandedId === item.id) void detail.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setBusy(null)
    }
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const item = pendingRemove
    setPendingRemove(null)
    setBusy('remove')
    try {
      await careerloom.integrationAction(item.id, 'remove')
      showToast(`Removed ${item.name}`)
      if (expandedId === item.id) setExpandedId(undefined)
      void list.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setBusy(null)
    }
  }

  const saveConfig = async (id: string, patch: Record<string, string | boolean | null>) => {
    setBusy('configure')
    try {
      await careerloom.setIntegrationConfig(id, patch)
      showToast('Saved')
      void detail.refresh()
      void list.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SetupSummary items={items} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={list.loading} onClick={() => list.refresh()}>
            <RefreshCw className={list.loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> {list.loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add integration</Button>
        </div>
      </div>

      {list.error && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load integrations: {list.error.message} Check your career-ops folder in Settings, then refresh.
        </p>
      )}

      {!list.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <CategoryNav counts={counts} value={category} onChange={setCategory} />
          <Card className="min-w-0 flex-1 p-3">
            {shown.length === 0 ? (
              <EmptyState icon={Plug} message="Nothing here yet" description="Add a job source, skill, or plugin to get started." action="Add integration" onAction={() => setAddOpen(true)} />
            ) : (
              <IntegrationTable
                items={shown}
                expandedId={expandedId}
                onToggle={toggle}
                renderDetail={item => (
                  <IntegrationDetailPanel
                    detail={detail.data?.id === item.id ? detail.data : null}
                    loading={detail.loading && detail.data?.id !== item.id}
                    busy={busy}
                    onAction={action => void runAction(item, action)}
                    onSaveConfig={patch => void saveConfig(item.id, patch)}
                  />
                )}
              />
            )}
          </Card>
        </div>
      )}

      <AddIntegrationDialog open={addOpen} onClose={() => setAddOpen(false)} onInstalled={() => list.refresh()} />

      <AlertDialog open={pendingRemove !== null} onOpenChange={v => { if (!v) setPendingRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove?.kind === 'skill' ? 'Deletes its local copy.' : pendingRemove?.kind === 'source' ? 'Stops tracking this company in portals.yml.' : 'This can be re-added later.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmRemove()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
