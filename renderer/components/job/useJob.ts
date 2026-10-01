import { useEffect, useMemo, useState } from 'react'

import { usePolled } from '../../hooks/usePolled'
import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { ScreenedJob } from '../jobs/filters'
import { usePrescreen } from '../jobs/prescreen'

/** The listing (with its pre-screen) plus the structured view; reloads when a run ends or structuring finishes. */
export function useJob(id: string) {
  const { generation } = useRuns()
  const jobs = usePolled(() => careerloom.listJobs(), [generation], { intervalMs: 20_000 })
  const prescreen = usePrescreen(generation)
  const view = usePolled(() => careerloom.jobView(id), [id, generation], { intervalMs: null })
  const { refresh } = view
  useEffect(() => careerloom.onJobView(e => { if (e.id === id) refresh() }), [id, refresh])
  const job = useMemo((): ScreenedJob | null => {
    const j = jobs.data?.find(x => x.id === id)
    return j ? (prescreen.map[j.id] ? { ...j, screen: prescreen.map[j.id] } : j) : null
  }, [jobs.data, prescreen.map, id])
  return { job, view, jobs, prescreen }
}

/** Evaluate / re-evaluate this one job; `run` is the live record so the header can show progress inline. */
export function useEvaluateOne(id: string) {
  const { adopt, runs, logs } = useRuns()
  const [runId, setRunId] = useState<string | null>(null)
  const run = runId ? runs.find(r => r.id === runId) ?? null : null
  const running = run?.status === 'running'
  const last = running && runId ? (logs[runId] ?? '').trim().split('\n').at(-1)?.slice(0, 120) ?? '' : ''
  const start = async (ids: string[], force = false): Promise<boolean> => {
    try {
      const r = await careerloom.evaluateJobs(ids, force)
      adopt(r)
      setRunId(r.id)
      return true
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
      return false
    }
  }
  return { start, running, last, status: run?.status ?? null, id }
}
