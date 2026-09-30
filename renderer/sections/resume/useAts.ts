import { useCallback, useEffect, useState } from 'react'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import type { AtsAnswer } from '../../lib/types'
import { IDLE, type AtsLive } from './ctx'

/** Live state of the analysis run. `onSettled` refetches the report when a round ends or asks something. */
export function useAtsLive(onSettled: () => void, jobId?: string) {
  const [live, setLive] = useState<AtsLive>(IDLE)

  useEffect(() => careerloom.onAtsEvent(e => {
    setLive(prev => ({
      running: e.phase !== 'done' && !e.questions?.length,
      phase: e.phase,
      message: e.message,
      error: null,
      events: [...prev.events.slice(-19), e],
      questions: e.questions ?? (e.phase === 'done' ? [] : prev.questions),
    }))
    if (e.phase === 'done' || e.phase === 'parse' || e.questions?.length) onSettled()
  }), [onSettled])

  const analyze = useCallback(async (jd: string, templateId?: string) => {
    setLive({ ...IDLE, running: true, phase: 'parse', message: 'Starting' })
    try { await careerloom.atsAnalyze({ jd: jd.trim() || undefined, jobId, templateId }) } catch (err) {
      setLive({ ...IDLE, error: normalizeCliError(err).message })
    }
  }, [jobId])

  const answer = useCallback(async (runId: string, answers: AtsAnswer[]) => {
    setLive(prev => ({ ...prev, running: true, phase: 'agent', message: 'Sending your answers', questions: [], error: null }))
    try { await careerloom.atsAnswer(runId, answers, jobId) } catch (err) {
      setLive(prev => ({ ...prev, running: false, error: normalizeCliError(err).message }))
    }
  }, [jobId])

  return { live, analyze, answer }
}
