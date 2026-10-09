import { useState, type ReactNode } from 'react'

import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import type { CliRunner, ProviderId } from '../../lib/types'
import { PROVIDER_IDS, PROVIDERS } from '../../../electron/llm/providers'
import { RunLog } from '../RunLog'
import { KeyField } from '../settings/KeyField'

// Shared pieces of the first-run flow (renderer/sections/Onboarding.tsx).

export const ENGINES: Array<{ id: CliRunner; label: string; what: string; url: string; install: string | null; signIn: string }> = [
  { id: 'claude', label: 'Claude Code', what: 'Anthropic’s agent. Uses your Claude subscription.', url: 'https://docs.anthropic.com/en/docs/claude-code/setup', install: 'npm install -g @anthropic-ai/claude-code', signIn: 'claude' },
  { id: 'codex', label: 'Codex', what: 'OpenAI’s agent. Uses your ChatGPT plan.', url: 'https://developers.openai.com/codex/cli', install: 'npm install -g @openai/codex', signIn: 'codex login' },
  { id: 'antigravity', label: 'Antigravity', what: 'Google’s agent CLI (agy). Uses your Google account.', url: 'https://antigravity.google', install: null, signIn: 'agy' },
  { id: 'opencode', label: 'OpenCode', what: 'Open-source agent CLI. Free models with an OpenCode Zen key.', url: 'https://opencode.ai/docs/', install: 'npm install -g opencode-ai', signIn: 'opencode' },
]
export const OPENCODE_KEYS = 'https://opencode.ai/auth'
export const OPENROUTER_KEYS = 'https://openrouter.ai/keys'

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
export const BTN = `btnp ${RING}`
export const PRIMARY = `btnp btnp-primary px-4 py-2 ${RING}`
export const LINK = `bg-transparent border-0 p-0 cursor-pointer text-[length:var(--fs-meta)] text-muted-foreground underline underline-offset-2 hover:text-foreground ${RING}`

export const errorText = (err: unknown) => normalizeCliError(err).message

export function StepHeader({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h2 className="m-0 text-xl font-semibold" tabIndex={-1} data-step-title>{title}</h2>
      <p className="m-0 text-muted-foreground">{lead}</p>
    </header>
  )
}

/** One thing that must be present: a status line, plain explanation, and how to get it. */
export function Requirement({ ok, title, status, children }: { ok: boolean; title: string; status: string; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <b>{title}</b>
        <span className={ok ? 'text-success' : 'text-warning'}>{status}</span>
      </div>
      {!ok && children && <div className="flex flex-col gap-2 text-[length:var(--fs-meta)] text-muted-foreground">{children}</div>}
    </li>
  )
}

export function Download({ label, url }: { label: string; url: string }) {
  return <button type="button" className={`${BTN} self-start`} onClick={() => void careerloom.openExternal(url)}>{label}</button>
}

/** A terminal command the user can copy (the only terminal step onboarding asks for). */
export function Command({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => void navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md border border-border bg-card px-2 py-1 font-mono text-foreground">{cmd}</code>
      <button type="button" className={BTN} onClick={copy} aria-label={`Copy command: ${cmd}`}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? <p role="alert" className="m-0 text-destructive">{message}</p> : null
}

/** An LLM provider / OpenCode Zen key: saved to the OS keychain through the shared Settings KeyField; never read back. `selectable` lets the user pick the provider (default OpenRouter). */
export function ApiKeyField({ hasKey, onSaved, provider = 'openrouter', selectable = false }: { hasKey: boolean; onSaved: (provider: ProviderId | 'opencode') => void; provider?: ProviderId | 'opencode'; selectable?: boolean }) {
  const [chosen, setChosen] = useState<ProviderId | 'opencode'>(provider)
  const name = chosen === 'opencode' ? 'OpenCode Zen' : PROVIDERS[chosen].label
  const label = `${name} API key`
  return (
    <div className="flex flex-col gap-2">
      {selectable && (
        <select aria-label="Provider" className="h-8 max-w-60 rounded-md border border-input bg-background px-2 text-sm" value={chosen} onChange={e => setChosen(e.target.value as ProviderId)}>
          {PROVIDER_IDS.map(id => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}
        </select>
      )}
      <KeyField
        label={label}
        placeholder={hasKey ? 'Key saved. Paste a new one to replace it' : chosen === 'openrouter' ? 'OpenRouter API key (sk-or-…)' : label}
        onSubmit={async v => { await careerloom.setApiKey(v, chosen); onSaved(chosen) }}
      />
    </div>
  )
}

/** A setup/agent run's live log, with its status and a Stop button (RunsDrawer's RunLog). */
export function LiveRun({ id }: { id: string }) {
  const { runs, logs, cancel } = useRuns()
  const run = runs.find(r => r.id === id)
  if (!run) return null
  return <div className="flex h-64 flex-col"><RunLog run={run} log={logs[id]} onCancel={cancel} /></div>
}

export function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-3 pt-2">{children}</div>
}
