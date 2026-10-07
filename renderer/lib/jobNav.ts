import { careerloom } from './ipc'
import { navigate } from './nav'
import { showToast } from './toast'
import type { Application } from './types'

// The Jobs list remembers what the job page needs: the ids as currently filtered (prev/next),
// plus selection and table scroll so Back lands where the user left.
const KEY = 'careerloom.jobs.ui'
let ids: string[] = []
type Ui = { selected: string[]; scroll: number }

/** The Job page reads this once when it opens, to land on a tab other than Overview. */
export const JOB_TAB_KEY = 'careerloom.job.tab'
export const openJob = (id: string, tab?: string) => {
  try { if (tab) sessionStorage.setItem(JOB_TAB_KEY, tab) } catch { /* storage can be unavailable */ }
  navigate('job', { id })
}
/** A tracker row opens its job page (jobs and tracker rows join on the report number). */
export const openApplication = (app: Application): void => void careerloom.listJobs().then(js => {
  const j = js.find(x => x.reportNum === app.num)
  if (j) openJob(j.id)
  else showToast('That role is not in your Jobs list', 'error')
}).catch(() => showToast('Could not open that job. Try again.', 'error'))
export const setJobList = (next: string[]) => { ids = next }
export const neighbours = (id: string): { prev: string | null; next: string | null; index: number; total: number } => {
  const i = ids.indexOf(id)
  return { prev: i > 0 ? ids[i - 1]! : null, next: i >= 0 && i < ids.length - 1 ? ids[i + 1]! : null, index: i, total: ids.length }
}
export function saveJobsUi(ui: Ui): void {
  try { globalThis.sessionStorage?.setItem(KEY, JSON.stringify(ui)) } catch { /* storage can be unavailable */ }
}
export function loadJobsUi(): Ui {
  try {
    const o = JSON.parse(globalThis.sessionStorage?.getItem(KEY) ?? '{}') as Partial<Ui>
    return { selected: Array.isArray(o.selected) ? o.selected.filter(x => typeof x === 'string') : [], scroll: typeof o.scroll === 'number' ? o.scroll : 0 }
  } catch { return { selected: [], scroll: 0 } }
}
