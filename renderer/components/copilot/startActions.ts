import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import type { StartRequest } from '@/lib/types'
import { errorText } from './api'
import { getPracticePick, getSelection } from './selection'

/** Starts a practice session for the selected job; the chosen/own questions ride along as additive fields. Resolves to the session id, or null after a toast. */
export async function startPractice(): Promise<string | null> {
  const { jobId, interviewType } = getSelection()
  if (!jobId) { showToast('Pick a job on Setup first: every session belongs to a job', 'error'); return null }
  const { ids, custom } = getPracticePick()
  const req: StartRequest = { mode: 'practice', jobId, interviewType, consent: null, ...(ids ? { questionIds: ids } : {}), ...(custom.length ? { custom } : {}) }
  try { return (await careerloom.copilotStart(req)).sessionId } catch (e) { showToast(errorText(e), 'error'); return null }
}

export async function stopSession(): Promise<void> {
  try { await careerloom.copilotStop('user') } catch (e) { showToast(errorText(e), 'error') }
}
