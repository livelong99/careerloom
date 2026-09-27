import { useEffect, useState } from 'react'

import { applyTheme, readTheme, type Theme } from '../lib/theme'
import { Icon } from '../components/icons'
import { Panel } from '../components/Panel'
import { SegTabs } from '../components/SegTabs'
import { LocalModelSetup } from '../components/onboarding/ModelStep'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'
import type { CliCheck, CliRunner, ModelOption, RunnerId, Settings as SettingsData } from '../lib/types'

const RUNNERS: Array<{ id: RunnerId; label: string; bin: 'claude' | 'codex' | 'antigravity' | null; note: string }> = [
  { id: 'claude', label: 'Claude Code', bin: 'claude', note: 'Uses your Claude subscription. Can edit files and run career-ops scripts; nothing else without asking.' },
  { id: 'codex', label: 'Codex', bin: 'codex', note: 'Uses your ChatGPT/Codex plan (codex exec --full-auto, sandboxed to the folder).' },
  { id: 'antigravity', label: 'Antigravity', bin: 'antigravity', note: 'Google Antigravity CLI (agy -p). Runs in agy’s sandbox: any command, but it can only write inside your career-ops folder.' },
  { id: 'api', label: 'API key', bin: null, note: 'Any model via OpenRouter — free models work. Covers evaluate, scan, pipeline and apply.' },
]

const act = async (fn: () => Promise<unknown>, ok?: string) => {
  try { await fn(); if (ok) showToast(ok) } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
}

export function Settings({ settings, onChanged }: { settings: SettingsData; onChanged: () => void }) {
  const { adopt } = useRuns()
  const bins = usePolled(() => careerloom.runnerStatus(), [], { intervalMs: null })
  const [recheck, setRecheck] = useState(0)
  const ready = usePolled(() => careerloom.getReadiness(recheck > 0), [recheck, settings.root], { intervalMs: null, enabled: settings.rootCheck?.ok === true })
  useEffect(() => careerloom.onReadiness(() => ready.refresh()), [ready.refresh])
  const [key, setKey] = useState('')
  const [theme, setTheme] = useState<Theme>(readTheme)
  const check = settings.rootCheck

  const pickFolder = () => act(async () => {
    const dir = await careerloom.chooseDirectory()
    if (!dir) return
    await careerloom.setRoot(dir)
    onChanged()
  }, 'career-ops folder set')

  const install = () => act(async () => {
    const dir = await careerloom.chooseDirectory()
    if (!dir) return
    adopt(await careerloom.setupCareerOps(dir))
  }, 'Installing career-ops… follow it in Agent')

  return (
    <>
      <Panel title="Workspace">
        <div className="set-rows">
          <div className="about-row">
            <div className="tx">
              {check?.ok ? check.root : 'No career-ops folder yet'}
              <small>
                {check?.ok
                  ? 'Your CV, tracker and reports live here. Careerloom only reads them; the agent writes.'
                  : check ? check.reason : 'Point Careerloom at a career-ops checkout, or install a fresh one.'}
              </small>
            </div>
            <div className="r">
              <button type="button" className="btnp" onClick={() => void pickFolder()}>Choose folder…</button>
              {!check?.ok && <button type="button" className="btnp btnp-primary" disabled={!bins.data?.git} title={bins.data?.git ? undefined : 'git not found'} onClick={() => void install()}>Install career-ops…</button>}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Agent"
        right={settings.rootCheck?.ok
          ? <button type="button" className="btnp" disabled={ready.loading} onClick={() => setRecheck(n => n + 1)}>{ready.loading ? 'Checking…' : 'Check again'}</button>
          : undefined}
      >
        {ready.data && !ready.data.deps && (
          <p className="drawer-note status-line warn"><Icon name="triangle-alert" />career-ops' dependencies aren't installed yet. Open Integrations, then career-ops, then Repair (runs npm install).</p>
        )}
        <div className="set-rows">
          {RUNNERS.map(r => {
            const found = r.bin ? bins.data?.[r.bin] : settings.hasApiKey ? 'key saved' : null
            return (
              <div className="about-row" key={r.id}>
                <div className="tx">
                  {r.label} {settings.runner === r.id && <span className="stage stage-evaluated">Active</span>}
                  <small>{r.note}</small>
                  <small className={found ? 'status-line ok' : 'status-line muted'}>
                    <Icon name={found ? 'circle-check' : 'circle'} />{found ?? (r.bin ? 'Not found on PATH' : 'No key yet')}
                  </small>
                  {r.bin && (check?.ok
                    ? <CliStatus check={ready.data?.clis.find(c => c.id === r.bin)} checking={ready.loading && !ready.data} />
                    : <small className="status-line muted">Choose or install a career-ops folder to check sign-in and skills</small>)}
                  {r.bin && <ModelPicker runner={r.bin} value={settings.models[r.bin] ?? ''} onSaved={onChanged} />}
                </div>
                <div className="r">
                  <button type="button" className="btnp" disabled={settings.runner === r.id} onClick={() => void act(async () => { await careerloom.setRunner(r.id); onChanged() })}>{settings.runner === r.id ? 'In use' : 'Use'}</button>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="API key">
        <p className="set-sub" style={{ marginTop: 0, marginBottom: 12 }}>Only needed for the API key runner. Stored in your OS keychain, never in the career-ops folder.</p>
        <div className="field">
          <input type="password" aria-label="OpenRouter API key" placeholder={settings.hasApiKey ? 'OpenRouter key saved — paste to replace' : 'OpenRouter API key (sk-or-…)'} value={key} onChange={e => setKey(e.target.value)} autoComplete="off" />
          <div className="row-actions">
            <button type="button" className="btnp" disabled={!key.trim()} onClick={() => void act(async () => { await careerloom.setApiKey(key); setKey(''); onChanged() }, 'Key saved to your OS keychain')}>Save key</button>
            <button type="button" className="set-text-button" onClick={() => void careerloom.openExternal('https://openrouter.ai/keys')}>Get a key</button>
            {settings.hasApiKey && <button type="button" className="btnp btnp-danger" onClick={() => void act(async () => { await careerloom.setApiKey(null); onChanged() }, 'Key removed')}>Remove key</button>}
          </div>
        </div>
      </Panel>

      <Panel title="Local model">
        <LocalModelSetup />
      </Panel>

      <Panel title="Appearance">
        <SegTabs
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          value={theme}
          onChange={v => { setTheme(v as Theme); applyTheme(v as Theme) }}
        />
      </Panel>
    </>
  )
}

/** Model for one CLI: suggestions from the CLI (Antigravity lists its own), any id allowed.
 *  Empty = the CLI's default model. Saves on Enter or when the field loses focus. */
function ModelPicker({ runner, value, onSaved }: { runner: CliRunner; value: string; onSaved: () => void }) {
  const [draft, setDraft] = useState(value)
  const [options, setOptions] = useState<ModelOption[] | null>(null)
  useEffect(() => setDraft(value), [value])
  const load = () => { if (!options) void careerloom.listModels(runner).then(setOptions).catch(() => setOptions([])) }
  const save = () => {
    const next = draft.trim()
    if (next === value) return
    void act(async () => { await careerloom.setModel(runner, next || null); onSaved() }, next ? `Model set to ${next}` : 'Using the default model')
  }
  const listId = `models-${runner}`
  return (
    <label className="mt-2 flex items-center gap-2 text-[length:var(--fs-meta)] text-muted-foreground">
      Model
      <input
        className="set-input w-64"
        list={listId}
        placeholder="Default"
        value={draft}
        onFocus={load}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        aria-label={`Model for ${runner}`}
      />
      <datalist id={listId}>
        {(options ?? []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </datalist>
    </label>
  )
}

/** One CLI's readiness for the chosen folder: what works, and the exact fix for what doesn't. */
function CliStatus({ check, checking }: { check: CliCheck | undefined; checking: boolean }) {
  if (checking) return <small className="status-line muted" role="status">Checking…</small>
  if (!check) return null
  const facts = [
    check.version ? `Installed ${check.version}` : 'Not installed',
    check.signedIn === true ? 'signed in' : check.signedIn === false ? 'not signed in' : 'sign-in unknown',
    check.skill ? 'career-ops skill found' : 'career-ops skill missing',
  ]
  return (
    <>
      <small className={check.ready ? 'status-line ok' : 'status-line warn'}>
        <Icon name={check.ready ? 'circle-check' : 'triangle-alert'} />{check.ready ? 'Ready' : 'Needs attention'}
      </small>
      <small>{facts.join(' · ')}</small>
      {check.problems.map(p => <small key={p}>{p}</small>)}
    </>
  )
}
