import { useEffect, useMemo, useState } from 'react'
import { Plug, Plus, RefreshCw } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Group, Note } from '../../copilot/Group'
import { AddIntegrationDialog } from '../../integrations/AddIntegrationDialog'
import { BrowserAcks } from '../../integrations/BrowserAcks'
import { CategoryNav, type Category } from '../../integrations/CategoryNav'
import { IntegrationDetailPanel } from '../../integrations/IntegrationDetailPanel'
import { IntegrationTable } from '../../integrations/IntegrationTable'
import { SetupSummary } from '../../integrations/SetupSummary'
import { EmptyState } from '../../kit/EmptyState'
import { usePolled } from '../../../hooks/usePolled'
import { useRuns } from '../../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { NAVIGATE_EVENT } from '../../../lib/nav'
import { showToast } from '../../../lib/toast'
import type { Integration, IntegrationAction, IntegrationDetail, Run } from '../../../lib/types'

const CAREER_OPS = 'skill:career-ops'

const isRun = (value: unknown): value is Run => Boolean(value) && typeof value === 'object' && 'startedAt' in (value as object)

// TODO(merge): use lib/nav goToSettings(page, focus) once it lands; until then dispatch the nav event directly.
const openPage = (section: 'boards' | 'settings', page?: string, focus?: string) =>
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: page ? { section, page, focus } : section }))

/** Settings › Integrations: services, skills and plugins with health, config and actions; job sources live in Boards. */
// PageProps (settings, onChanged) come from the shell; the page loads its own data. `focus` is optional (the shell pulses the target itself).
export function IntegrationsPage({ focus }: { settings?: unknown; onChanged?: () => void; focus?: string }) {
  const { generation, adopt } = useRuns()
  const list = usePolled(() => careerloom.listIntegrations(), [generation], { intervalMs: 20_000, memoKey: 'integrations' })
  // Job sources are managed in Boards; counted for the link, never listed here.
  const items = useMemo(() => (list.data ?? []).filter(i => i.kind !== 'source'), [list.data])
  const sourceCount = (list.data ?? []).length - items.length

  const [category, setCategory] = useState<Category>('all')
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState<IntegrationAction | null>(null)
  const [pendingRemove, setPendingRemove] = useState<Integration | null>(null)

  // `focus` = "integration:<name>" → expand the matching row once the list is in.
  useEffect(() => {
    const name = focus?.startsWith('integration:') ? focus.slice('integration:'.length) : null
    const hit = name ? items.find(i => i.id.endsWith(`:${name}`)) : undefined
    if (hit) setExpandedId(hit.id)
  }, [focus, items])

  const detail = usePolled<IntegrationDetail>(() => careerloom.getIntegration(expandedId!), [expandedId], { intervalMs: null, enabled: expandedId !== undefined })

  const counts = useMemo(() => {
    const base: Record<Category, number> = { all: items.length, skill: 0, source: sourceCount, service: 0, plugin: 0 }
    for (const item of items) base[item.kind] += 1
    return base
  }, [items, sourceCount])

  const shown = category === 'all' || category === 'source' ? items : items.filter(i => i.kind === category)
  const careerOps = items.find(i => i.id === CAREER_OPS)

  const fail = (err: unknown) => showToast(normalizeCliError(err).message, 'error', 6000)
  const refreshAll = (id?: string) => { void list.refresh(); if (id && id === expandedId) void detail.refresh() }

  const runAction = async (item: Integration, action: IntegrationAction) => {
    if (action === 'remove') { setPendingRemove(item); return }
    setBusy(action)
    try {
      const result = await careerloom.integrationAction(item.id, action)
      if (isRun(result)) { adopt(result); showToast(`Started: ${item.name} — ${action}`) } else showToast(`${item.name}: ${action} done`)
      refreshAll(item.id)
    } catch (err) { fail(err) } finally { setBusy(null) }
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
    } catch (err) { fail(err) } finally { setBusy(null) }
  }

  const saveConfig = async (id: string, patch: Record<string, string | boolean | null>) => {
    setBusy('configure')
    try {
      await careerloom.setIntegrationConfig(id, patch)
      showToast('Saved')
      refreshAll(id)
    } catch (err) { fail(err) } finally { setBusy(null) }
  }

  const extraFor = (item: Integration) => {
    if (item.id === 'service:browser') return <BrowserAcks />
    if (item.id === 'service:firecrawl') {
      return (
        <Note>
          API key (optional) is managed in{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => openPage('settings', 'keys', 'key:firecrawl')}>API keys</button>.
        </Note>
      )
    }
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <Group
        title="Integrations"
        action={(
          <>
            <Button variant="ghost" size="sm" disabled={list.loading} onClick={() => list.refresh()}>
              <RefreshCw className={list.loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> {list.loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add skill or plugin</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <SetupSummary items={items} />
          {careerOps && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">career-ops</span>
              <span className="text-muted-foreground">{careerOps.statusText}</span>
              {(['check', 'update'] as const).filter(a => careerOps.actions.includes(a)).map(a => (
                <Button key={a} size="sm" variant="secondary" disabled={busy !== null} onClick={() => void runAction(careerOps, a)}>
                  {busy === a ? 'Working…' : a === 'check' ? 'Check career-ops' : 'Update career-ops'}
                </Button>
              ))}
            </div>
          )}
          <CategoryNav counts={counts} value={category} onChange={setCategory} onOpenSources={() => openPage('boards')} />
        </div>
      </Group>

      {list.error && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't load integrations: {list.error.message} Check your career-ops folder in General, then refresh.
        </p>
      )}

      {!list.data ? (
        <Skeleton className="h-64 w-full" />
      ) : shown.length === 0 ? (
        <EmptyState icon={Plug} message="Nothing here yet" description="Add a skill or plugin to get started." action="Add skill or plugin" onAction={() => setAddOpen(true)} />
      ) : (
        <Group className="p-3">
          <IntegrationTable
            items={shown}
            expandedId={expandedId}
            onToggle={id => setExpandedId(prev => (prev === id ? undefined : id))}
            renderDetail={item => (
              <IntegrationDetailPanel
                detail={detail.data?.id === item.id ? detail.data : null}
                loading={detail.loading && detail.data?.id !== item.id}
                busy={busy}
                onAction={action => void runAction(item, action)}
                onSaveConfig={patch => void saveConfig(item.id, patch)}
                extra={extraFor(item)}
                hideConfig={item.id === 'service:firecrawl' ? ['apiKey'] : undefined}
              />
            )}
          />
        </Group>
      )}

      <AddIntegrationDialog open={addOpen} onClose={() => setAddOpen(false)} onInstalled={() => list.refresh()} />

      <AlertDialog open={pendingRemove !== null} onOpenChange={v => { if (!v) setPendingRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>{pendingRemove?.kind === 'skill' ? 'Deletes its local copy.' : 'This can be re-added later.'}</AlertDialogDescription>
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
