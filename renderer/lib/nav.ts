import type { Section } from '../components/Sidebar'
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

/** Open a Settings page, optionally scrolling to and pulsing one control (`data-focus` id, e.g. `key:openrouter`). */
export const goToSettings = (page: PageId, focus?: string) => navigate('settings', { page, focus })
export const goToIntegrations = () => goToSettings('integrations')
