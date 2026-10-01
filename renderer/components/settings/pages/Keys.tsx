import { Button } from '@/components/ui/button'
import { usePolled } from '../../../hooks/usePolled'
import { careerloom } from '../../../lib/ipc'
import { goToSettings } from '../../../lib/nav'
import type { KeyInfo, RunnerId } from '../../../lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { KeyRow } from '../KeyRow'
import { ReadinessBadge } from '../kit'
import type { PageProps } from '../pages'

/** Keys the active runner needs come first; everything else keeps registry order. */
const sorted = (keys: KeyInfo[], runner: RunnerId): KeyInfo[] => [...keys].sort((a, b) => Number(b.neededByRunners.includes(runner)) - Number(a.neededByRunners.includes(runner)))

export function KeysPage({ settings, onChanged }: PageProps) {
  const keys = usePolled(() => careerloom.keysList(), [settings.hasApiKey, settings.hasOpencodeKey], { intervalMs: null })
  const plugins = usePolled(async () => (await careerloom.listIntegrations()).filter(i => i.kind === 'plugin'), [], { intervalMs: null })
  const refresh = () => { keys.refresh(); onChanged() }
  const list = keys.data ?? []
  const missingNeeded = list.filter(k => k.neededByRunners.includes(settings.runner) && !k.hasKey)

  return (
    <>
      {keys.error && <Note tone="warn">Not available yet: {keys.error.message}</Note>}
      {keys.loading && !keys.data && <p className="m-0 text-xs text-muted-foreground">Loading…</p>}
      {missingNeeded.length > 0 && <Note tone="warn">Your active runner needs: {missingNeeded.map(k => k.label).join(', ')}. Add it below.</Note>}
      {list.length > 0 && list.every(k => !k.hasKey) && <Note>No keys yet. Which do I need? Only the key for your active runner; the rest are optional.</Note>}
      {sorted(list, settings.runner).map(k => <KeyRow key={k.id} info={k} activeRunner={settings.runner} onChanged={refresh} />)}
      <Group title="Plugin keys" focus="plugin-keys" action={<Button size="sm" variant="outline" onClick={() => goToSettings('integrations')}>Integrations →</Button>}>
        <Note>Read-only. Plugin keys live in the career-ops <code>.env</code>; set them from the plugin's row in Integrations. Values are never read back.</Note>
        <div className="mt-2">
          {plugins.error && <p className="m-0 text-xs text-muted-foreground">Could not list plugins: {plugins.error.message}</p>}
          {plugins.data?.length === 0 && <p className="m-0 text-xs text-muted-foreground">No plugins installed.</p>}
          {(plugins.data ?? []).map(p => (
            <Row key={p.id} label={p.name} hint={p.statusText}>
              <ReadinessBadge state={p.status === 'ready' ? 'ready' : 'needs-setup'} label={p.status === 'ready' ? 'Set' : 'Missing'} />
              <Button size="sm" variant="outline" onClick={() => goToSettings('integrations', p.id)}>Open</Button>
            </Row>
          ))}
        </div>
      </Group>
    </>
  )
}
