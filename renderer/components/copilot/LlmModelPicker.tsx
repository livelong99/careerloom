import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { careerloom } from '@/lib/ipc'
import type { LlmModelInfo } from '@/lib/types'
import { errorText, isNotImplemented } from './api'

const ID_RE = /^[\w.:/@-]{1,100}$/
export const isValidModelId = (id: string): boolean => ID_RE.test(id)

const POLICY = {
  'no-collect': { variant: 'success', text: "Doesn't collect data" },
  'may-collect': { variant: 'warn', text: 'May collect data' },
  unknown: { variant: 'warn', text: 'Data policy unknown' },
} as const

const price = (n: number | null): string => (n === null ? '?' : `$${n}`)
const meta = (m: LlmModelInfo): string =>
  `${m.contextTokens ? `${Math.round(m.contextTokens / 1000)}k context · ` : ''}${price(m.promptUsdPerM)} in / ${price(m.completionUsdPerM)} out per million tokens${m.supportsStreaming ? '' : ' · no streaming'}`

type Probe = { kind: 'ok' | 'fail' | 'off'; text: string } | null

/** One model row for a speed tier: current model, data-policy badge, Test, and a searchable list plus a typed-id fallback. `models: null` = list unavailable. */
export function LlmModelPicker({ tier, value, models, onChange }: { tier: string; value: string | null; models: LlmModelInfo[] | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | null>(null)
  const [probe, setProbe] = useState<Probe>(null)
  const [testing, setTesting] = useState(false)

  const current = models?.find(m => m.id === value) ?? null
  const shown = useMemo(() => (models ?? []).filter(m => `${m.name} ${m.id}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50), [models, query])

  async function test(): Promise<void> {
    if (!value) return
    setTesting(true)
    try {
      const r = await careerloom.copilotTestLlmModel(value)
      if (isNotImplemented(r)) setProbe({ kind: 'off', text: 'Testing is not available in this build yet' })
      else if (r.ok && r.firstTokenMs !== null) setProbe({ kind: 'ok', text: `First word ${(r.firstTokenMs / 1000).toFixed(1)} s` })
      else setProbe({ kind: 'fail', text: r.message ?? 'The test failed' })
    } catch (e) { setProbe({ kind: 'fail', text: errorText(e) }) } finally { setTesting(false) }
  }

  function pick(id: string): void { onChange(id); setProbe(null); setOpen(false); setQuery(''); setTyped(''); setTypedError(null) }
  function useTyped(): void {
    const id = typed.trim()
    if (!isValidModelId(id)) { setTypedError('Use letters, digits and . _ : / @ - only (up to 100 characters)'); return }
    pick(id)
  }

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="w-20 text-sm font-medium text-foreground">{tier}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs text-foreground">{value ?? 'No model chosen'}</div>
          {current && <div className="text-xs text-muted-foreground">{meta(current)}</div>}
        </div>
        {current && <Badge variant={POLICY[current.dataPolicy].variant}>{POLICY[current.dataPolicy].text}</Badge>}
        {probe && <Badge variant={probe.kind === 'ok' ? 'neutral' : 'warn'}>{probe.text}</Badge>}
        <Button size="sm" variant="outline" onClick={() => setOpen(o => !o)} aria-expanded={open}>Change…</Button>
        <Button size="sm" variant="ghost" onClick={() => void test()} disabled={!value || testing || probe?.kind === 'off'} title={probe?.kind === 'off' ? probe.text : undefined}>Test</Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {models === null
            ? <p className="m-0 text-xs text-muted-foreground">Model list unavailable: type a model id</p>
            : (
              <>
                <Input aria-label="Search models" placeholder="Search models" value={query} onChange={e => setQuery(e.target.value)} />
                <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-auto p-0">
                  {shown.map(m => (
                    <li key={m.id}>
                      <button type="button" onClick={() => pick(m.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm text-foreground">{m.name}</span><span className="block truncate text-xs text-muted-foreground">{meta(m)}</span></span>
                        <Badge variant={POLICY[m.dataPolicy].variant}>{POLICY[m.dataPolicy].text}</Badge>
                      </button>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">No model matches</li>}
                </ul>
              </>
            )}
          <div className="flex items-center gap-2">
            <Input aria-label="OpenRouter model id" placeholder="provider/model-name" value={typed} onChange={e => { setTyped(e.target.value); setTypedError(null) }} className="font-mono" />
            <Button size="sm" onClick={useTyped}>Use this id</Button>
          </div>
          {typedError && <p role="alert" className="m-0 text-xs text-destructive">{typedError}</p>}
        </div>
      )}
    </div>
  )
}
