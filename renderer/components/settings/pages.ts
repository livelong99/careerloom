import type { Settings } from '../../lib/types'

// The 12 Settings pages in 5 groups (design.md §1). Page bodies live in ./pages/*; this file is data only.
export type PageId = 'general' | 'updates' | 'runners' | 'keys' | 'local-models' | 'skills' | 'integrations' | 'jobs' | 'resume' | 'agent' | 'copilot' | 'interview-prep' | 'monitoring' | 'data' | 'advanced'

export const PAGE_GROUPS: ReadonlyArray<{ label: string; pages: ReadonlyArray<{ id: PageId; label: string; blurb: string }> }> = [
  { label: 'Basics', pages: [
      { id: 'general', label: 'General', blurb: 'Where your data lives, how the app looks and how often it refreshes.' },
      { id: 'updates', label: 'Updates', blurb: 'Check GitHub Releases and update Careerloom in place.' },
    ] },
  {
    label: 'AI',
    pages: [
      { id: 'runners', label: 'Runners & models', blurb: 'Which agent does the work, and with which model.' },
      { id: 'keys', label: 'API keys', blurb: 'Keys stay in your OS keychain. Only the last four characters are ever shown.' },
      { id: 'local-models', label: 'Local models', blurb: 'On-device models for pre-screening and Copilot transcription.' },
      { id: 'skills', label: 'Skills', blurb: 'Install Agent Skills from GitHub, a folder or a .zip, and choose which ones agents use.' },
    ],
  },
  { label: 'Connections', pages: [{ id: 'integrations', label: 'Integrations', blurb: 'career-ops, job-data services, research search and extra skills.' }] },
  {
    label: 'Workflows',
    pages: [
      { id: 'jobs', label: 'Jobs & boards', blurb: 'Pre-screen policy and pipeline limits.' },
      { id: 'resume', label: 'Resume & documents', blurb: 'Defaults for tailored résumés and cover letters.' },
      { id: 'agent', label: 'Agent', blurb: 'What the active runner may do.' },
      { id: 'copilot', label: 'Copilot', blurb: 'Transcription, answer engine and privacy.' },
      { id: 'interview-prep', label: 'Interview prep', blurb: 'Job research, search providers and the interviewer’s voice.' },
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

/** Props every page body receives. `onChanged` re-reads settings after a write. Deep-link focus is handled by the shell via `data-setting-id="<id>"` on a control. */
export type PageProps = { settings: Settings; onChanged: () => void }
