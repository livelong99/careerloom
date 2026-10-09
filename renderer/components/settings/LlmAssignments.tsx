// Feature → provider → model table (Settings › Runners & models). The helper row writes settings.json `llm.helper`;
// the Copilot row writes copilot.json (its models are limited to fast ones, chosen on the Copilot page).
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCopilotConfig } from '../copilot/api'
import { usePolled } from '../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { goToSettings } from '../../lib/nav'
import { copilotSupportedHere } from '../../lib/platform'
import { showToast } from '../../lib/toast'
import type { ProviderId, ProviderRow, Settings } from '../../lib/types'
import { Group, Note } from '../kit/Group'
import { MODEL_ID } from './ModelField'

const SELECT = 'h-8 max-w-60 rounded-md border border-input bg-background px-2 text-sm text-foreground'

/** Providers without a key are disabled (the saved choice stays selectable); a hint links to the key. */
export function ProviderSelect({ id, label, value, rows, noneLabel, onChange }: { id: string; label: string; value: ProviderId | null; rows: ProviderRow[]; noneLabel?: string; onChange: (p: ProviderId | null) => void }) {
  const usable = (r: ProviderRow) => (r.hasKey || r.keyOptional) && !r.needsBaseUrl
  const current = rows.find(r => r.id === value)
  return (
    <div className="flex items-center gap-2">
      <select id={id} aria-label={label} className={SELECT} value={value ?? ''} onChange={e => onChange((e.target.value || null) as ProviderId | null)}>
        {noneLabel && <option value="">{noneLabel}</option>}
        {rows.map(r => <option key={r.id} value={r.id} disabled={!usable(r) && r.id !== value}>{r.label}{usable(r) ? '' : r.needsBaseUrl ? ' (add address)' : ' (add key)'}</option>)}
      </select>
      {current && !usable(current) && <Button size="sm" variant="outline" onClick={() => goToSettings('keys', `key:${current.id}`)}>Add key</Button>}
    </div>
  )
}

/** Free text with the provider's own model list as suggestions; empty = the provider's fast default. */
function HelperModel({ provider, value, onSave }: { provider: ProviderId; value: string; onSave: (m: string | null) => void }) {
  const [draft, setDraft] = useState(value)
  const [options, setOptions] = useState<string[] | null>(null)
  useEffect(() => setDraft(value), [value])
  useEffect(() => setOptions(null), [provider])
  const next = draft.trim()
  const invalid = next !== '' && !MODEL_ID.test(next)
  const load = () => { if (!options) void careerloom.llmModels(provider).then(m => setOptions(m.map(x => x.id)), () => setOptions([])) }
  return (
    <div className="flex items-center gap-2">
      <Input aria-label="Helper model" list="llm-helper-models" className="h-8 max-w-72" placeholder="Provider default" value={draft} aria-invalid={invalid || undefined} onFocus={load} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !invalid) onSave(next || null); if (e.key === 'Escape') setDraft(value) }} />
      <datalist id="llm-helper-models">{(options ?? []).map(o => <option key={o} value={o} />)}</datalist>
      {next !== value && !invalid && <Button size="sm" onClick={() => onSave(next || null)}>Save</Button>}
      {invalid && <span role="alert" className="text-xs" style={{ color: 'var(--bad)' }}>Letters, digits and . _ : / @ - only</span>}
    </div>
  )
}

export function LlmAssignments({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const providers = usePolled(() => careerloom.llmProviders(), [settings.hasApiKey], { intervalMs: null })
  const { config, save } = useCopilotConfig()
  const rows = Array.isArray(providers.data) ? providers.data : []
  const helper = settings.llm.helper
  const setHelper = async (next: { provider: ProviderId; model: string | null } | null) => {
    try { await careerloom.llmSet({ helper: next }); onChanged() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  const copilotProvider = config?.engine.provider ?? 'openrouter'

  return (
    <Group title="Models by feature" focus="llm-assignments">
      <Note>Pick which provider answers each feature. Add the provider's key first (Settings › API keys). The Interview Copilot only offers fast models, because answers are read live.</Note>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 pr-3 font-medium">Feature</th><th className="pb-2 pr-3 font-medium">Provider</th><th className="pb-2 font-medium">Model</th></tr></thead>
        <tbody>
          <tr className="border-t border-border align-top">
            <td className="py-3 pr-3"><div className="font-medium">Helper calls</div><div className="text-xs text-muted-foreground">Tidy postings, triage, research, humanize</div></td>
            <td className="py-3 pr-3"><ProviderSelect id="llm-helper-provider" label="Helper provider" value={helper?.provider ?? null} rows={rows} noneLabel="Use the selected runner" onChange={p => void setHelper(p ? { provider: p, model: null } : null)} /></td>
            <td className="py-3">{helper ? <HelperModel provider={helper.provider} value={helper.model ?? ''} onSave={m => void setHelper({ provider: helper.provider, model: m })} /> : <span className="text-xs text-muted-foreground">The runner’s helper model</span>}</td>
          </tr>
          {copilotSupportedHere() && (
            <tr className="border-t border-border align-top">
              <td className="py-3 pr-3"><div className="font-medium">Interview Copilot</div><div className="text-xs text-muted-foreground">Live answers: fast models only</div></td>
              <td className="py-3 pr-3"><ProviderSelect id="llm-copilot-provider" label="Copilot provider" value={copilotProvider} rows={rows} onChange={p => { if (p) void save({ engine: { provider: p, models: { fast: null, balanced: null, deep: null } } }) }} /></td>
              <td className="py-3"><Button size="sm" variant="outline" onClick={() => goToSettings('copilot')}>Choose fast model →</Button></td>
            </tr>
          )}
          <tr className="border-t border-border align-top">
            <td className="py-3 pr-3"><div className="font-medium">Agent runs</div><div className="text-xs text-muted-foreground">Evaluate, scan, résumé edits, chat</div></td>
            <td className="py-3 pr-3 text-xs text-muted-foreground" colSpan={2}>Follow the runner above. The API-key runner is OpenRouter only.</td>
          </tr>
        </tbody>
      </table>
    </Group>
  )
}
