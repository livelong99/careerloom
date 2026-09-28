import { useState } from 'react'

import { usePolled } from '../../hooks/usePolled'
import { careerloom } from '../../lib/ipc'
import type { ToolCheck } from '../../lib/types'
import { ApiKeyField, BTN, Command, Download, ENGINES, ErrorLine, Footer, OPENCODE_KEYS, OPENROUTER_KEYS, PRIMARY, Requirement, StepHeader, errorText } from './parts'

const found = (t: ToolCheck | undefined, name: string) => (t?.ok ? `${name} ${t.version}` : 'Not found')

/** Node + Git + one engine (an agent CLI or an OpenRouter key). Sign-in is checked after setup. */
export function PrereqStep({ hasApiKey, hasOpencodeKey, onKeySaved, onNext }: { hasApiKey: boolean; hasOpencodeKey: boolean; onKeySaved: () => void; onNext: () => void }) {
  const [tick, setTick] = useState(0)
  const pre = usePolled(() => careerloom.prerequisites(), [tick], { intervalMs: null })
  const bins = usePolled(() => careerloom.runnerStatus(), [tick], { intervalMs: null })
  const p = pre.data
  const checking = pre.loading || bins.loading
  const nodeOld = Boolean(p?.node.version && !p.node.ok)
  const engines = ENGINES.filter(e => bins.data?.[e.id])
  const hasEngine = engines.length > 0 || hasApiKey || hasOpencodeKey
  const ok = Boolean(p?.node.ok && p.npm.ok && p.git.ok && hasEngine)
  const recheck = () => setTick(n => n + 1)

  return (
    <>
      <StepHeader title="Check what’s installed" lead="Careerloom drives an AI agent on your computer. It needs a few free tools first. Install anything missing, then check again." />
      {pre.error && <ErrorLine message={`Couldn’t check your tools: ${errorText(pre.error)}`} />}
      <ul className="m-0 list-none p-0" aria-busy={checking}>
        <Requirement ok={Boolean(p?.node.ok && p.npm.ok)} title="Node.js 18 or newer" status={!p ? 'Checking…' : !p.node.ok ? (nodeOld ? `Node ${p.node.version} is too old` : 'Not found') : !p.npm.ok ? 'npm not found' : found(p.node, 'Node')}>
          <span>Runs career-ops’ scripts. npm comes with it. Install the LTS version.</span>
          <Download label="Download Node.js" url="https://nodejs.org/en/download" />
        </Requirement>
        <Requirement ok={Boolean(p?.git.ok)} title="Git" status={!p ? 'Checking…' : found(p.git, 'Git')}>
          <span>Downloads career-ops and keeps it up to date.</span>
          {p?.platform === 'darwin' && <><span>On a Mac, this installs it:</span><Command cmd="xcode-select --install" /></>}
          <Download label="Download Git" url="https://git-scm.com/downloads" />
        </Requirement>
        <Requirement ok={hasEngine} title="An AI agent" status={!bins.data ? 'Checking…' : hasEngine ? [...engines.map(e => e.label), ...(hasOpencodeKey ? ['OpenCode Zen key'] : []), ...(hasApiKey ? ['API key'] : [])].join(', ') : 'None found'}>
          <span>Install one of these agent tools, or add an OpenCode Zen key below (it also runs OpenCode's free models headlessly). You’ll sign in to a CLI after setup.</span>
          {ENGINES.map(e => (
            <div key={e.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <span><b className="text-foreground">{e.label}</b> — {e.what}</span>
              {e.install && <Command cmd={e.install} />}
              <Download label={`Get ${e.label}`} url={e.url} />
            </div>
          ))}
          <span>Or skip installing: an OpenCode Zen API key lets Careerloom run the agent itself (free models stay free).</span>
          <ApiKeyField provider="opencode" hasKey={hasOpencodeKey} onSaved={onKeySaved} />
          <Download label="Get an OpenCode Zen key" url={OPENCODE_KEYS} />
          <span>Or use any model through an OpenRouter API key (free models work, fewer features).</span>
          <ApiKeyField hasKey={hasApiKey} onSaved={onKeySaved} />
          <Download label="Get an OpenRouter key" url={OPENROUTER_KEYS} />
        </Requirement>
      </ul>
      <Footer>
        {ok
          ? <><button type="button" className={BTN} disabled={checking} onClick={recheck}>Check again</button><button type="button" className={PRIMARY} onClick={onNext}>Continue</button></>
          : <button type="button" className={PRIMARY} disabled={checking} onClick={recheck}>{checking ? 'Checking…' : 'Check again'}</button>}
      </Footer>
    </>
  )
}
