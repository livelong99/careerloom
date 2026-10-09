import { useEffect, useState } from 'react'

import { usePolled } from '../../hooks/usePolled'
import { careerloom } from '../../lib/ipc'
import type { CliCheck, ProviderId, RunnerId, Settings } from '../../lib/types'
import { ApiKeyField, BTN, Command, Download, ENGINES, ErrorLine, Footer, LINK, OPENCODE_KEYS, OPENROUTER_KEYS, PRIMARY, StepHeader, errorText } from './parts'

function cliStatus(c: CliCheck | undefined): string {
  if (!c) return 'Checking…'
  if (c.ready) return c.signedIn === null ? 'Installed' : 'Ready'
  if (!c.path) return 'Not installed'
  if (c.signedIn === false) return 'Not signed in'
  return 'Needs attention'
}

/** Pick who does the work. Readiness (install, sign-in, skill) is probed against the new folder. */
export function AgentStep({ settings, onChanged, onNext }: { settings: Settings; onChanged: () => void; onNext: () => void }) {
  const [tick, setTick] = useState(0)
  const ready = usePolled(() => careerloom.getReadiness(true), [tick], { intervalMs: null })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => careerloom.onReadiness(onChanged), [onChanged]) // main may switch runner to a ready CLI
  const clis = ready.data?.clis ?? []
  const selected = settings.runner
  const usable = selected === 'zen' ? settings.hasOpencodeKey : selected === 'api' ? settings.hasApiKey : clis.find(c => c.id === selected)?.ready === true

  const pick = async (runner: RunnerId) => {
    setError(null)
    try { await careerloom.setRunner(runner); onChanged() } catch (err) { setError(errorText(err)) }
  }

  return (
    <>
      <StepHeader title="Choose your agent" lead="This is the AI that reads job posts, scores them and tailors your résumé. It runs on your computer with your own account." />
      {ready.error && <ErrorLine message={`Couldn’t check your agents: ${errorText(ready.error)}`} />}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-busy={ready.loading}>
        <legend className="sr-only">Agent</legend>
        {ENGINES.map(e => {
          const c = clis.find(x => x.id === e.id)
          return (
            <label key={e.id} className="flex flex-col gap-2 rounded-md border border-border p-3 has-[:checked]:border-[var(--accent)]">
              <span className="flex items-center gap-3">
                <input type="radio" name="runner" checked={selected === e.id} disabled={!c?.ready} onChange={() => void pick(e.id)} />
                <b className="flex-1">{e.label}</b>
                <span className={c?.ready ? 'text-success' : 'text-muted-foreground'}>{ready.loading && !c ? 'Checking…' : cliStatus(c)}</span>
              </span>
              {c && !c.ready && (
                <span className="flex flex-col gap-2 pl-7 text-[length:var(--fs-meta)] text-muted-foreground">
                  {!c.path && <>{e.install ? <Command cmd={e.install} /> : null}<Download label={`Get ${e.label}`} url={e.url} /></>}
                  {c.path && c.signedIn === false && <><span>Open Terminal, run this and follow the sign-in prompt, then check again:</span><Command cmd={e.signIn} /></>}
                  {c.path && c.signedIn !== false && c.problems.map(p => <span key={p}>{p}</span>)}
                </span>
              )}
            </label>
          )
        })}
        <label className="flex flex-col gap-2 rounded-md border border-border p-3 has-[:checked]:border-[var(--accent)]">
          <span className="flex items-center gap-3">
            <input type="radio" name="runner" checked={selected === 'zen'} disabled={!settings.hasOpencodeKey} onChange={() => void pick('zen')} />
            <b className="flex-1">OpenCode Zen API key</b>
            <span className={settings.hasOpencodeKey ? 'text-success' : 'text-muted-foreground'}>{settings.hasOpencodeKey ? 'Key saved' : 'No key'}</span>
          </span>
          <span className="pl-7 text-[length:var(--fs-meta)] text-muted-foreground">Nothing to install: Careerloom runs the agent itself on OpenCode Zen (paid models, needs a key). For free models, use OpenCode.</span>
        </label>
        {!settings.hasOpencodeKey && (
          <div className="flex flex-col gap-2 pl-7">
            <ApiKeyField provider="opencode" hasKey={false} onSaved={() => void pick('zen')} />
            <Download label="Get an OpenCode Zen key" url={OPENCODE_KEYS} />
          </div>
        )}
        <label className="flex flex-col gap-2 rounded-md border border-border p-3 has-[:checked]:border-[var(--accent)]">
          <span className="flex items-center gap-3">
            <input type="radio" name="runner" checked={selected === 'api'} disabled={!settings.hasApiKey} onChange={() => void pick('api')} />
            <b className="flex-1">OpenRouter API key</b>
            <span className={settings.hasApiKey ? 'text-success' : 'text-muted-foreground'}>{settings.hasApiKey ? 'Key saved' : 'No key'}</span>
          </span>
          <span className="pl-7 text-[length:var(--fs-meta)] text-muted-foreground">Any model, free ones included. Evaluates and scans jobs, but can’t edit your résumé.</span>
        </label>
        {!settings.hasApiKey && (
          <div className="flex flex-col gap-2 pl-7">
            <ApiKeyField selectable hasKey={false} onSaved={p => { if (p === 'openrouter') void pick('api'); else void careerloom.llmSet({ helper: { provider: p as ProviderId, model: null } }).then(onChanged) }} />
            <Download label="Get an OpenRouter key" url={OPENROUTER_KEYS} />
            <span className="text-[length:var(--fs-meta)] text-muted-foreground">Other providers: the key is used for helper calls and the Interview Copilot. Choose models in Settings › Runners &amp; models.</span>
          </div>
        )}
      </fieldset>
      <ErrorLine message={error} />
      <Footer>
        {!usable && <button type="button" className={LINK} onClick={onNext}>Skip for now</button>}
        {usable
          ? <><button type="button" className={BTN} disabled={ready.loading} onClick={() => setTick(n => n + 1)}>Check again</button><button type="button" className={PRIMARY} onClick={onNext}>Continue</button></>
          : <button type="button" className={PRIMARY} disabled={ready.loading} onClick={() => setTick(n => n + 1)}>{ready.loading ? 'Checking…' : 'Check again'}</button>}
      </Footer>
    </>
  )
}
