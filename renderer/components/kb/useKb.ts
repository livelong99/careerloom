import { useCallback, useEffect, useRef, useState } from 'react'

import type { KbItemView, KbSummary, ResearchProgress } from '../../../electron/kb/types'
import { normalizeCliError } from '../../lib/ipc'
import { isStub, kb } from './api'

export type KbData = {
  summary: KbSummary | null; items: KbItemView[]; progress: ResearchProgress | null
  loading: boolean; error: string | null; unavailable: boolean; reload: () => Promise<void>
}

/** Summary + the whole bank (hidden included; the table filters client-side) for one job, kept live through kbChanged / kbProgress. */
export function useKb(jobId: string): KbData {
  const [summary, setSummary] = useState<KbSummary | null>(null)
  const [items, setItems] = useState<KbItemView[]>([])
  const [progress, setProgress] = useState<ResearchProgress | null>(null)
  const [state, setState] = useState<{ loading: boolean; error: string | null; unavailable: boolean }>({ loading: true, error: null, unavailable: false })
  const seq = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const mine = ++seq.current
    try {
      const [s, list] = await Promise.all([kb().kbSummary(jobId), kb().kbList(jobId, { hidden: true })])
      if (mine !== seq.current) return
      if (isStub(s) || isStub(list)) { setState({ loading: false, error: null, unavailable: true }); return }
      setSummary(s); setItems(list); setState({ loading: false, error: null, unavailable: false })
      if (s.status !== 'running') setProgress(null)
    } catch (err) {
      if (mine === seq.current) setState({ loading: false, error: normalizeCliError(err).message, unavailable: false })
    }
  }, [jobId])

  useEffect(() => {
    setSummary(null); setItems([]); setProgress(null); setState({ loading: true, error: null, unavailable: false })
    void reload()
    const offChanged = kb().onKbEvent('kbChanged', e => { if (e.jobId === jobId) void reload() })
    const offProgress = kb().onKbEvent('kbProgress', setProgress)
    return () => { seq.current += 1; offChanged(); offProgress() }
  }, [jobId, reload])

  return { summary, items, progress, ...state, reload }
}
