import { setSelection, gotoPage } from '../copilot/selection'
import { navigate } from '../../lib/nav'

// Hand-off to the Practice page (owned by the interviewer package): the job to practise and, optionally, the exact questions.
let seed: { jobId: string; itemIds: string[] | null } | null = null
/** Practice reads this once on mount; it is cleared when taken. */
export const takeKbPracticeSeed = (): { jobId: string; itemIds: string[] | null } | null => { const s = seed; seed = null; return s }

export function practiseKb(jobId: string, itemIds: string[] | null = null): void {
  seed = { jobId, itemIds }
  setSelection({ jobId })
  navigate('copilot')
  gotoPage('practice')
}
