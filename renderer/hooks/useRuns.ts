import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'
import type { Run } from '../lib/types'

export type Runs = {
  runs: Run[]
  /** False until the first history load has answered (success or not). */
  loaded: boolean
  logs: Record<string, string>
  /** Bumps whenever a run ends, so file-backed views reload what the agent wrote. */
  generation: number
  start: (mode: string, input?: string) => Promise<Run | null>
  /** `start('evaluate')`, but via Firecrawl prefetch when available. */
  evaluate: (input: string) => Promise<Run | null>
  adopt: (run: Run) => void
  cancel: (id: string) => void
  /** Forget finished runs (history + saved logs); resolves with how many went. */
  forget: (ids: string[]) => Promise<number>
}

/** Live agent runs: the list, their streamed logs, and a refresh signal. */
export function useRunsState(): Runs {
  const [runs, setRuns] = useState<Run[]>([])
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [generation, setGeneration] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void careerloom.listRuns().then(setRuns).catch(() => {}).finally(() => setLoaded(true))
    const known = new Set<string>()
    return careerloom.onRun(event => {
      // Main can start runs on its own (e.g. the next job in a batch) — pick them up.
      if (!known.has(event.id)) {
        known.add(event.id)
        void careerloom.listRuns().then(setRuns).catch(() => {})
      }
      if (event.kind === 'chunk') {
        setLogs(prev => ({ ...prev, [event.id]: (prev[event.id] ?? '') + event.text }))
        return
      }
      setRuns(prev => prev.map(r => (r.id === event.id ? { ...r, status: event.status, endedAt: Date.now() } : r)))
      setGeneration(g => g + 1)
      if (event.status === 'failed') showToast('A run failed — open Runs for the log', 'error')
    })
  }, [])

  const adopt = useCallback((run: Run) => setRuns(prev => [run, ...prev.filter(r => r.id !== run.id)]), [])

  const start = useCallback(async (mode: string, input?: string) => {
    try {
      const run = await careerloom.startRun({ mode, ...(input ? { input } : {}) })
      adopt(run)
      showToast(`Started: ${run.label}`)
      return run
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
      return null
    }
  }, [adopt])

  const evaluate = useCallback(async (input: string) => {
    try {
      const run = await careerloom.evaluateJob(input)
      adopt(run)
      showToast(`Started: ${run.label}`)
      return run
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
      return null
    }
  }, [adopt])

  const cancel = useCallback((id: string) => { void careerloom.cancelRun(id) }, [])

  const forget = useCallback(async (ids: string[]) => {
    const n = await careerloom.deleteRuns(ids)
    setRuns(await careerloom.listRuns())
    setLogs(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))))
    return n
  }, [])

  return { runs, loaded, logs, generation, forget, start, evaluate, adopt, cancel }
}

export const RunsContext = createContext<Runs | null>(null)

export function useRuns(): Runs {
  const ctx = useContext(RunsContext)
  if (!ctx) throw new Error('useRuns outside RunsContext')
  return ctx
}
