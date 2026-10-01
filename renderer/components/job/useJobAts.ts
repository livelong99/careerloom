import { useCallback } from 'react'

import { usePolled } from '../../hooks/usePolled'
import { useRuns } from '../../hooks/useRuns'
import { careerloom } from '../../lib/ipc'
import { useAtsLive } from '../../sections/resume/useAts'

/** This job's own ATS analysis (kept apart from the résumé-level one) plus the live run state. */
export function useJobAts(jobId: string) {
  const { generation } = useRuns()
  const report = usePolled(() => careerloom.atsGet(jobId), [jobId, generation], { intervalMs: null })
  const { refresh } = report
  const settled = useCallback(() => refresh(), [refresh])
  const ats = useAtsLive(settled, jobId)
  return { report: report.data ?? null, loading: report.data === undefined && !report.error, live: ats.live, run: () => ats.analyze(''), answer: ats.answer }
}
export type JobAts = ReturnType<typeof useJobAts>
