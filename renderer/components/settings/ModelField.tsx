// Model id for one runner (main or helper tier): suggestions from the runner, any id allowed, empty = default.
// Draft-with-validate: Save appears when the draft differs; Enter saves, Esc reverts, blur does not.
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { ModelOption, ModelRunner } from '../../lib/types'

export const MODEL_ID = /^[\w.:/@-]{1,100}$/

export function ModelField({ runner, value, helper = false, onSaved }: { runner: ModelRunner; value: string; helper?: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState(value)
  const [options, setOptions] = useState<ModelOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(value), [value])
  const next = draft.trim()
  const invalid = next !== '' && !MODEL_ID.test(next)
  const kind = helper ? 'Helper model' : 'Model'
  const id = `model-${runner}${helper ? '-helper' : ''}`

  const load = () => { if (!options) void careerloom.listModels(runner).then(setOptions, () => setOptions([])) }
  const save = async () => {
    if (invalid || busy) return
    setBusy(true)
    try {
      await (helper ? careerloom.setHelperModel : careerloom.setModel)(runner, next || null)
      showToast(next ? `${kind} set to ${next}` : helper ? 'Using the built-in helper model' : 'Using the default model')
      onSaved()
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="w-28 shrink-0 text-xs text-muted-foreground">{kind}</label>
        <Input id={id} list={`${id}-list`} className="h-8 max-w-72" placeholder={helper ? 'Built-in cheap model' : 'Default'} value={draft} aria-invalid={invalid || undefined}
          onFocus={load} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setDraft(value) }} />
        <datalist id={`${id}-list`}>{(options ?? []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</datalist>
        {next !== value && !invalid && (
          <>
            <Button size="sm" disabled={busy} onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(value)}>Revert</Button>
          </>
        )}
      </div>
      {invalid && <p role="alert" className="m-0 pl-30 text-xs" style={{ color: 'var(--bad)' }}>Letters, digits and . _ : / @ - only (up to 100 characters)</p>}
    </div>
  )
}
