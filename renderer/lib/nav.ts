import type { Section } from '../components/Sidebar'

export const NAVIGATE_EVENT = 'careerloom:navigate'
export type NavTarget = Section | { section: Section; id?: string }

/** Jump to a screen from anywhere; `id` deep-links (e.g. `navigate('boards', { id })` opens that board's editor). */
export function navigate(section: Section, opts: { id?: string } = {}): void {
  window.dispatchEvent(new CustomEvent<NavTarget>(NAVIGATE_EVENT, { detail: opts.id ? { section, id: opts.id } : section }))
}

export const goToIntegrations = () => navigate('integrations')
