// `interviewPlanPreview` IPC (plan §4): what the user will get before pressing Start. macOS and Windows, like the rest of the interviewer.
import type { Handler } from '../context'
import { copilotSupported } from '../copilot/capabilities'
import { parsePlan, previewPlan } from './plan'
import { interviewPool } from './pool'

const JOB_ID = /^.{1,2000}$/s

export const interviewPlanPreview: Handler = async (jobId: unknown, plan: unknown) => {
  if (!copilotSupported()) throw new Error('The AI interviewer is available on macOS and Windows only')
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId.trim())) throw new Error('Pick a job first')
  const pool = interviewPool(jobId)
  if (!pool) throw new Error('This job has no question base yet: research it in the Knowledge base tab first')
  return previewPlan(pool.items, parsePlan(plan), { skills: pool.skills, recent: pool.recent })
}
