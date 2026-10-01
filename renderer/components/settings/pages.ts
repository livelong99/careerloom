import type { Settings } from '../../lib/types'

// The 12 Settings pages in 5 groups (design.md §1). Page bodies live in ./pages/*; this file is data only.
export type PageId = 'general' | 'runners' | 'keys' | 'local-models' | 'integrations' | 'jobs' | 'resume' | 'agent' | 'copilot' | 'monitoring' | 'data' | 'advanced'

export const PAGE_GROUPS: ReadonlyArray<{ label: string; pages: ReadonlyArray<{ id: PageId; label: string; blurb: string }> }> = [
  { label: 'Basics', pages: [{ id: 'general', label: 'General', blurb: 'Where your data lives, how the app looks and how often it refreshes.' }] },
  {
    label: 'AI',
    pages: [
      { id: 'runners', label: 'Runners & models', blurb: 'Which agent does the work, and with which model.' },
      { id: 'keys', label: 'API keys', blurb: 'Keys stay in your OS keychain. Only the last four characters are ever shown.' },
      { id: 'local-models', label: 'Local models', blurb: 'On-device models for pre-screening and Copilot transcription.' },
    ],
  },
  { label: 'Connections', pages: [{ id: 'integrations', label: 'Integrations', blurb: 'Services, browser login, skills and plugins.' }] },
  {
    label: 'Workflows',
    pages: [
      { id: 'jobs', label: 'Jobs & boards', blurb: 'Pre-screen policy and pipeline limits.' },
      { id: 'resume', label: 'Resume & documents', blurb: 'Defaults for tailored résumés and cover letters.' },
      { id: 'agent', label: 'Agent', blurb: 'What the active runner may do.' },
      { id: 'copilot', label: 'Copilot', blurb: 'Transcription, answer engine and privacy.' },
      { id: 'monitoring', label: 'Monitoring', blurb: 'Refresh, run-log retention and what raises findings.' },
    ],
  },
  {
    label: 'System',
    pages: [
      { id: 'data', label: 'Data & privacy', blurb: "Where everything is stored, what's secret, and how to clear it." },
      { id: 'advanced', label: 'Advanced', blurb: 'Diagnostics, limits and resets.' },
    ],
  },
]

export const PAGES = PAGE_GROUPS.flatMap(g => g.pages)
export const isPageId = (v: unknown): v is PageId => PAGES.some(p => p.id === v)
export const pageLabel = (id: PageId): string => PAGES.find(p => p.id === id)!.label

/** Props every page body receives. `onChanged` re-reads settings after a write. Deep-link focus is handled by the shell via `data-focus="<id>"` on a control. */
export type PageProps = { settings: Settings; onChanged: () => void }
