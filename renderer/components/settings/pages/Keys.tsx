import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePolled } from '../../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { goToSettings } from '../../../lib/nav'
import { showToast } from '../../../lib/toast'
import type { KeyInfo, RunnerId } from '../../../lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { KeyRow } from '../KeyRow'
import { ReadinessBadge } from '../kit'
import type { PageProps } from '../pages'

/** Keys the active runner needs come first; everything else keeps registry order. */
const sorted = (keys: KeyInfo[], runner: RunnerId): KeyInfo[] => [...keys].sort((a, b) => Number(b.neededByRunners.includes(runner)) - Number(a.neededByRunners.includes(runner)))

/** Address of the user's own OpenAI-compatible server (Ollama, LM Studio, vLLM…): https, or http on localhost only. */
function CustomServer({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const [value, setValue] = useState(current ?? '')
  const save = async () => {
    try { await careerloom.llmSet({ customBaseUrl: value.trim() || null }); showToast('Server address saved'); onSaved() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
      <label htmlFor="custom-base-url" className="text-xs text-muted-foreground">Custom server address</label>
      <Input id="custom-base-url" className="h-8 max-w-sm flex-1" placeholder="http://localhost:11434/v1" value={value} onChange={e => setValue(e.target.value)} />
      <Button size="sm" variant="outline" onClick={() => void save()}>Save address</Button>
    </div>
  )
}

const SectionTitle = ({ children }: { children: string }) => <h2 className="m-0 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>

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
      <SectionTitle>AI providers</SectionTitle>
      <Note>Use your own key with any of these, then choose which feature uses which in Settings › Runners & models.</Note>
      {sorted(list.filter(k => k.group === 'ai'), settings.runner).map(k => (
        <div key={k.id} className="flex flex-col gap-2">
          <KeyRow info={k} activeRunner={settings.runner} onChanged={refresh} />
          {k.id === 'custom' && <CustomServer current={settings.llm.customBaseUrl} onSaved={refresh} />}
        </div>
      ))}
      <SectionTitle>Search, scraping and runners</SectionTitle>
      {sorted(list.filter(k => k.group !== 'ai'), settings.runner).map(k => <KeyRow key={k.id} info={k} activeRunner={settings.runner} onChanged={refresh} />)}
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
