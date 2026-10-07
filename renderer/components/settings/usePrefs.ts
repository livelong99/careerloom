import { useCallback, useEffect, useRef, useState } from 'react'

import { errorText } from '@/components/copilot/api'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import type { Prefs, PrefsPatch } from '@/lib/types'

export const mergePrefs = (b: Prefs, p: PrefsPatch): Prefs => ({ updates: { ...b.updates, ...p.updates }, retention: { ...b.retention, ...p.retention }, docs: { ...b.docs, ...p.docs }, debug: { ...b.debug, ...p.debug }, evalPipeline: { ...b.evalPipeline, ...p.evalPipeline } })

/** settings.json `prefs`: `patch` applies at once and reverts (with a toast) if main refuses it. `error` = main not ready yet. */
export function usePrefs(): { prefs: Prefs | null; patch: (p: PrefsPatch) => Promise<void>; error: string | null } {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<Prefs | null>(null)
  ref.current = prefs
  useEffect(() => {
    let live = true
    careerloom.prefsGet().then(p => { if (live) setPrefs(p) }, e => { if (live) setError(errorText(e)) })
    return () => { live = false }
  }, [])
  const seq = useRef(0)
  const patch = useCallback(async (p: PrefsPatch) => {
    const before = ref.current
    const mine = ++seq.current // an older reply must not undo a newer edit
    if (before) { const optimistic = mergePrefs(before, p); ref.current = optimistic; setPrefs(optimistic) }
    try {
      const next = await careerloom.prefsSet(p)
      if (mine === seq.current) { ref.current = next; setPrefs(next) }
    } catch (e) {
      if (mine === seq.current) { // earlier refused edits are baked into `before`: ask main what it really has
        careerloom.prefsGet().then(p => { ref.current = p; setPrefs(p) }, () => { ref.current = before; setPrefs(before) })
      }
      showToast(errorText(e), 'error')
    }
  }, [])
  return { prefs, patch, error }
}
