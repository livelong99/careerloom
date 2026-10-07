// Bridge helpers shared by the ten Copilot pages: typed calls, "module not wired yet" handling, config and async hooks.
import { useCallback, useEffect, useRef, useState } from 'react'

import { careerloom, normalizeCliError } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import type { CopilotConfig, DeepPartial, NotImplemented } from '@/lib/types'

export const isNotImplemented = (v: unknown): v is NotImplemented =>
  typeof v === 'object' && v !== null && (v as { status?: unknown }).status === 'not-implemented'

/** A result, or null when the owning module (engine, capture, overlay…) is not wired into this build yet. */
export const orNull = <T,>(v: T | NotImplemented): T | null => (isNotImplemented(v) ? null : v)

export const errorText = (err: unknown): string => normalizeCliError(err).message

/** Plain objects merge key by key; arrays and scalars replace (same rule as main's config merge). */
export function mergeConfig<T>(base: T, patch: DeepPartial<T>): T {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!isObj(base) || !isObj(patch)) return patch as T
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = isObj(v) && isObj(out[k]) ? mergeConfig(out[k], v as never) : v
  return out as T
}

/** copilot.json: `save` applies the patch at once and reverts (with a toast) if main refuses it. */
export function useCopilotConfig(): { config: CopilotConfig | null; save: (patch: DeepPartial<CopilotConfig>) => Promise<CopilotConfig | null>; error: string | null } {
  const [config, setConfig] = useState<CopilotConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<CopilotConfig | null>(null)
  ref.current = config
  useEffect(() => {
    let live = true
    careerloom.copilotGetConfig().then(c => { if (live) setConfig(c) }, e => { if (live) setError(errorText(e)) })
    return () => { live = false }
  }, [])
  const seq = useRef(0)
  const save = useCallback(async (patch: DeepPartial<CopilotConfig>) => {
    const before = ref.current
    const mine = ++seq.current // only the newest edit may write the screen state: an older reply must not undo what was typed since
    if (before) { const optimistic = mergeConfig(before, patch); ref.current = optimistic; setConfig(optimistic) }
    try {
      const next = await careerloom.copilotSetConfig(patch)
      if (mine === seq.current) { ref.current = next; setConfig(next) }
      return next
    } catch (e) {
      if (mine === seq.current) { ref.current = before; setConfig(before) }
      showToast(errorText(e), 'error')
      return null
    }
  }, [])
  return { config, save, error }
}

export type Async<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void }
/** One fetch per dependency change; `reload()` fetches again. A stale response never overwrites a newer one. */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setState(s => ({ ...s, loading: true }))
    fetcher().then(data => { if (live) setState({ data, error: null, loading: false }) }, e => { if (live) setState({ data: null, error: errorText(e), loading: false }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: useCallback(() => setTick(t => t + 1), []) }
}
