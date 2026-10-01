import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePolled } from '../../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { goToSettings } from '../../../lib/nav'
import { showToast } from '../../../lib/toast'
import type { CliCheck, KeyTest, ModelRunner, RunnerId, Settings } from '../../../lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { Command, Download, ENGINES } from '../../onboarding/parts'
import { ModelField } from '../ModelField'
import { ReadinessBadge, TestResult, type ReadyState } from '../kit'
import type { PageProps } from '../pages'

type RunnerDef = { id: RunnerId; label: string; note: string; model: ModelRunner | null }
const RUNNERS: RunnerDef[] = [
  { id: 'claude', label: 'Claude Code', model: 'claude', note: 'Uses your Claude subscription. Can edit files and run career-ops scripts; nothing else without asking.' },
  { id: 'codex', label: 'Codex', model: 'codex', note: 'Uses your ChatGPT/Codex plan (codex exec, sandboxed to the folder).' },
  { id: 'antigravity', label: 'Antigravity', model: 'antigravity', note: 'Google Antigravity CLI (agy -p). Runs in its sandbox: any command, but it can only write inside your career-ops folder.' },
  { id: 'opencode', label: 'OpenCode', model: 'opencode', note: 'OpenCode CLI. Edits files and runs career-ops scripts only. Free models need no key; an OpenCode Zen key unlocks paid ones.' },
  { id: 'zen', label: 'OpenCode Zen (API)', model: 'zen', note: 'Nothing to install: Careerloom runs the agent itself on the OpenCode Zen API. Needs a Zen key and a paid model.' },
  { id: 'api', label: 'API key (OpenRouter)', model: null, note: 'Any model via OpenRouter, free ones included. Evaluates, scans and applies, but cannot edit your résumé.' },
]

/** Readiness of a CLI runner from its probe: `undefined` = not probed yet. Exported for tests. */
export function cliState(check: CliCheck | undefined, checking: boolean): { state: ReadyState; text: string } {
  if (!check) return checking ? { state: 'checking', text: 'Checking…' } : { state: 'needs-setup', text: 'Not checked' }
  if (check.ready) return { state: 'ready', text: 'Ready' }
  if (!check.path) return { state: 'needs-setup', text: 'Not installed' }
  if (check.signedIn === false) return { state: 'needs-setup', text: 'Not signed in' }
  return { state: 'error', text: 'Needs attention' }
}

function keyState(has: boolean, test: KeyTest | undefined): { state: ReadyState; text: string } {
  if (!has) return { state: 'needs-setup', text: 'No key yet' }
  return test && !test.ok ? { state: 'error', text: 'Key rejected' } : { state: 'ready', text: 'Key saved' }
}

const modelOf = (s: Settings, r: ModelRunner) => s.models[r] ?? ''

export function RunnersPage({ settings, onChanged }: PageProps) {
  const [tick, setTick] = useState(0)
  const ok = settings.rootCheck?.ok === true
  const ready = usePolled(() => careerloom.getReadiness(tick > 0), [tick, settings.root], { intervalMs: null, enabled: ok })
  useEffect(() => careerloom.onReadiness(() => ready.refresh()), [ready.refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tests, setTests] = useState<Partial<Record<RunnerId, KeyTest>>>({})
  const [testing, setTesting] = useState<RunnerId | null>(null)
  const checking = ready.loading

  const status = (r: RunnerDef) => r.id === 'zen' ? keyState(settings.hasOpencodeKey, settings.keyMeta.opencode) : r.id === 'api' ? keyState(settings.hasApiKey, settings.keyMeta.openrouter) : cliState(ready.data?.clis.find(c => c.id === r.id), checking && !ready.data)
  const use = async (id: RunnerId) => {
    try { await careerloom.setRunner(id); showToast(`${RUNNERS.find(r => r.id === id)!.label} is now your runner`); onChanged() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  /** CLI: re-probe install + sign-in. API runners: the key's connection test (no tokens). */
  const test = async (r: RunnerDef) => {
    setTesting(r.id)
    try {
      if (r.id === 'zen' || r.id === 'api') { const t = await careerloom.keysTest(r.id === 'zen' ? 'opencode' : 'openrouter'); setTests(p => ({ ...p, [r.id]: t })); onChanged() }
      else { const at = Date.now(); const rd = await careerloom.getReadiness(true); const c = rd?.clis.find(x => x.id === r.id); setTests(p => ({ ...p, [r.id]: { ok: c?.ready === true, latencyMs: null, detail: c?.problems[0] ?? (c?.path ? 'Not ready' : 'Not installed'), at } })); ready.refresh() }
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setTesting(null) }
  }
  const active = RUNNERS.find(r => r.id === settings.runner)!
  const activeModel = active.model ? modelOf(settings, active.model) || 'the runner’s default' : 'the model you pick on OpenRouter'
  const helperModel = active.model ? settings.helperModels[active.model] || 'the built-in cheap model' : 'the same model'

  return (
    <>
      <Group title="Runner" focus="active-runner" action={ok ? <Button size="sm" variant="outline" disabled={checking} onClick={() => setTick(n => n + 1)}>{checking ? 'Checking…' : 'Check again'}</Button> : undefined}>
        <Note>Active: <b>{active.label}</b> · {status(active).text}. The runner does the work: reads job posts, scores them and tailors your résumé.</Note>
        {!ok && <p className="m-0 mt-2 text-xs text-muted-foreground">Choose a career-ops folder in General to check sign-in and skills.</p>}
        {ready.data && !ready.data.deps && <p className="m-0 mt-2 text-xs" style={{ color: 'var(--warn)' }}>career-ops dependencies are not installed yet. Open Integrations › career-ops › Repair.</p>}
        {ready.error && <p className="m-0 mt-2 text-xs" style={{ color: 'var(--bad)' }}>Could not check runners: {ready.error.message}</p>}
      </Group>

      {RUNNERS.map(r => {
        const st = status(r)
        const isActive = settings.runner === r.id
        const check = ready.data?.clis.find(c => c.id === r.id)
        const engine = ENGINES.find(e => e.id === r.id)
        return (
          <section key={r.id} data-focus={`runner:${r.id}`} aria-label={r.label} className="flex flex-col gap-3 rounded-xl border bg-card/40 p-4" style={{ borderColor: isActive ? 'var(--accent)' : 'var(--border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 basis-80">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-sm font-semibold">{r.label}</h3>
                  {isActive && <ReadinessBadge state="ready" label="Active" />}
                  <ReadinessBadge state={st.state} label={st.text} />
                </div>
                <p className="m-0 mt-1 text-xs text-muted-foreground">{r.note}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={testing === r.id} onClick={() => void test(r)}>{testing === r.id ? 'Testing…' : 'Test'}</Button>
                <Button size="sm" disabled={isActive || st.state !== 'ready'} title={st.state !== 'ready' && !isActive ? 'Get it ready first (see below)' : undefined} onClick={() => void use(r.id)}>{isActive ? 'In use' : 'Use this runner'}</Button>
              </div>
            </div>
            {check && <p className="m-0 text-xs text-muted-foreground">{[check.version ? `Installed ${check.version}` : 'Not installed', check.signedIn === true ? 'signed in' : check.signedIn === false ? 'not signed in' : 'sign-in unknown', check.skill ? 'career-ops skill found' : 'career-ops skill missing'].join(' · ')}</p>}
            {(testing === r.id || tests[r.id]) && <TestResult running={testing === r.id} result={tests[r.id] ?? null} />}
            {check && !check.ready && engine && (
              <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                {!check.path && <>{engine.install && <Command cmd={engine.install} />}<Download label={`Get ${engine.label}`} url={engine.url} /></>}
                {check.path && check.signedIn === false && <><span>Open Terminal, run this and follow the sign-in prompt, then press Check again:</span><Command cmd={engine.signIn} /></>}
                {check.problems.filter(p => p !== tests[r.id]?.detail).map(p => <span key={p}>{p}</span>)}
              </div>
            )}
            {(r.id === 'zen' || r.id === 'api') && st.state === 'needs-setup' && <div><Button size="sm" variant="outline" onClick={() => goToSettings('keys', r.id === 'zen' ? 'key:opencode' : 'key:openrouter')}>Add the key →</Button></div>}
            {r.model && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <ModelField runner={r.model} value={modelOf(settings, r.model)} onSaved={onChanged} />
                <ModelField runner={r.model} value={settings.helperModels[r.model] ?? ''} helper onSaved={onChanged} />
              </div>
            )}
          </section>
        )
      })}

      <Group title="Which model does what" focus="routing">
        <Note>Read-only. Tasks follow your active runner; the helper tier is cheaper and used for tidying and humanizing text.</Note>
        <div className="mt-2">
          <Row label="Evaluate, scan, résumé edits, Agent chat" hint="The main model"><code className="text-xs">{activeModel}</code></Row>
          <Row label="Tidy job postings, humanize documents" hint="The helper model"><code className="text-xs">{helperModel}</code></Row>
          <Row label="Interview Copilot answers" hint="OpenRouter, configured on the Copilot page"><Button size="sm" variant="outline" onClick={() => goToSettings('copilot')}>Copilot →</Button></Row>
          <Row label="Job pre-screen and speech to text" hint="On-device models, no runner involved"><Button size="sm" variant="outline" onClick={() => goToSettings('local-models')}>Local models →</Button></Row>
        </div>
      </Group>
    </>
  )
}
