import type { Section } from '../components/Sidebar'

export const NAVIGATE_EVENT = 'careerloom:navigate'
export type NavTarget = Section | { section: Section; id?: string; page?: string; focus?: string }

/** Jump to a screen from anywhere; `id` deep-links (e.g. `navigate('boards', { id })` opens that board's editor); `page`/`focus` deep-link into Settings. */
export function navigate(section: Section, opts: { id?: string; page?: string; focus?: string } = {}): void {
  const detail = opts.id || opts.page ? { section, ...opts } : section
  window.dispatchEvent(new CustomEvent<NavTarget>(NAVIGATE_EVENT, { detail }))
}

export const goToSettings = (page: string, focus?: string) => navigate('settings', { page, focus })

export const goToIntegrations = () => navigate('integrations')
