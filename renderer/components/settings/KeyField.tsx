// The one secret input: Settings key rows, onboarding and Copilot all use it. The typed value lives only in
// this component's state, goes to `onSubmit` once, and is cleared on save, cancel and unmount; it is never echoed.
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeCliError } from '../../lib/ipc'

export function KeyField({ label, placeholder, hint, submitLabel = 'Save key', onSubmit, onCancel, autoFocus, id }: {
  /** Accessible name, e.g. "OpenRouter API key". */
  label: string
  placeholder?: string
  /** Accepted-format line under the input. */
  hint?: ReactNode
  submitLabel?: string
  /** Throw (or reject) with a message that never contains the value; it is shown under the input. */
  onSubmit: (value: string) => Promise<unknown> | unknown
  onCancel?: () => void
  autoFocus?: boolean
  id?: string
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(v)
      setValue('')
    } catch (err) { setError(normalizeCliError(err).message) } finally { setBusy(false) }
  }
  const cancel = () => { setValue(''); setError(null); onCancel?.() }

  return (
    <form className="flex min-w-0 flex-1 flex-col gap-1.5" onSubmit={e => { e.preventDefault(); void submit() }} onKeyDown={e => { if (e.key === 'Escape' && onCancel) { e.stopPropagation(); cancel() } }}>
      <div className="flex items-center gap-2">
        <Input id={id} type="password" autoComplete="off" spellCheck={false} aria-label={label} aria-invalid={error ? true : undefined} aria-describedby={id ? `${id}-hint` : undefined} placeholder={placeholder} value={value} onChange={e => { setValue(e.target.value); setError(null) }} disabled={busy} autoFocus={autoFocus} className="min-w-0 flex-1" />
        <Button type="submit" size="sm" disabled={!value.trim() || busy}>{busy ? 'Saving…' : submitLabel}</Button>
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>}
      </div>
      {hint && <p id={id ? `${id}-hint` : undefined} className="m-0 text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="m-0 text-xs" style={{ color: 'var(--bad)' }}>{error}</p>}
    </form>
  )
}
