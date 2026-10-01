// The one seam to the job knowledge base (WP1 store): integration registers the real source once at startup.
// Until then every job reports "no question base" and practice falls back to the report questions.
import type { InterviewDeps } from './session'

let source: InterviewDeps['pool'] = () => null
export const setInterviewPool = (f: InterviewDeps['pool']): void => { source = f }
export const interviewPool: InterviewDeps['pool'] = jobId => source(jobId)
