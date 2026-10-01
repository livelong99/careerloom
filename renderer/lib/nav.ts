import type { Section } from '../components/Sidebar'
import { careerloom, normalizeCliError } from './ipc'
import { showToast } from './toast'
import type { PageId } from '../components/settings/pages'

export const NAVIGATE_EVENT = 'careerloom:navigate'
export type NavTarget = Section | { section: Section; id?: string; page?: PageId; focus?: string }

/** Jump to a screen from anywhere; `id` deep-links (e.g. `navigate('boards', { id })` opens that board's editor),
 *  `page`/`focus` deep-link into Settings. The retired 'integrations' screen is accepted and routed to its Settings page. */
export function navigate(section: Section | 'integrations', opts: { id?: string; page?: PageId; focus?: string } = {}): void {
  const legacy = section === 'integrations'
  const to: Section = legacy ? 'settings' : section
  const extra = Object.fromEntries(Object.entries({ page: legacy ? 'integrations' : undefined, ...opts }).filter(([, v]) => v))
  const detail: NavTarget = Object.keys(extra).length ? ({ section: to, ...extra } as NavTarget) : to
  window.dispatchEvent(new CustomEvent<NavTarget>(NAVIGATE_EVENT, { detail }))
}

/** Open a Settings page, optionally scrolling to and pulsing one control (`data-setting-id` id, e.g. `key:openrouter`). */
export const goToSettings = (page: PageId, focus?: string) => navigate('settings', { page, focus })
export const goToIntegrations = () => goToSettings('integrations')

/** Agent screen opens this thread on mount (set by "Continue in chat"). */
export const OPEN_THREAD_KEY = 'careerloom.openThread'
/** Open the Runs page; `id` selects that run (e.g. "View log" on a past scan). Non-string ids are ignored. */
export const openRuns = (id?: unknown) => navigate('runs', typeof id === 'string' ? { id } : {})

/** Open the run as an Agent chat so the user can answer what it asked. */
export async function continueInChat(runId: string): Promise<void> {
  try {
    const thread = await careerloom.continueRun(runId)
    try { sessionStorage.setItem(OPEN_THREAD_KEY, thread.id) } catch { /* storage can be unavailable */ }
    navigate('agent')
  } catch (err) {
    showToast(normalizeCliError(err).message, 'error', 6000)
  }
}
