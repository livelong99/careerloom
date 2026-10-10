import { COPILOT } from './content-copilot'
import { SETTINGS_AI } from './content-settings'
import type { Topic } from './types'

export const INTERVIEW: Topic[] = [
  ...COPILOT,
  {
    id: 'prep', group: 'interview', title: 'Practice and question base', icon: 'search',
    summary: 'Researched questions for one job, and an AI interviewer to practise them with.',
    when: ['An interview is scheduled and you have time to prepare.', 'You want to rehearse answers out loud.'],
    steps: [
      { title: 'Build the question base', body: 'On a Job page open Knowledge base and start research. Careerloom searches the web for the company’s and role’s likely questions.' },
      { title: 'Review', body: 'Read the questions and add your own notes. They are saved with the job.' },
      { title: 'Practise', body: 'Start a practice session. The interviewer asks, probes and scores your answers, optionally with a spoken voice.' },
      { title: 'Read the debrief', body: 'A heat map shows which topics were strong and which need work.' },
    ],
    tips: ['Research needs a search provider key (Brave, Exa or Serper) set in Settings › Interview prep.'],
    go: [{ label: 'Interview prep settings', section: 'settings', page: 'interview-prep' }, { label: 'Open Jobs', section: 'jobs' }],
    keywords: 'knowledge base kb mock interview voice tts brave exa serper debrief',
  },
]

export const CONFIGURE: Topic[] = [
  ...SETTINGS_AI,
  {
    id: 'integrations', group: 'configure', title: 'Integrations', icon: 'puzzle',
    summary: 'The tools Careerloom connects to, grouped by purpose: Core, Job data, Research and Extensions.',
    when: ['A board needs Firecrawl or a browser session.', 'career-ops needs updating.'],
    steps: [
      { title: 'Core', body: 'career-ops itself. Check or update it here.' },
      { title: 'Job data', body: 'Firecrawl for any listing URL, and browser sessions for login-walled boards.' },
      { title: 'Research', body: 'Search providers for interview research, including self-hosted SearXNG.' },
      { title: 'Extensions', body: 'Extra skills the agent may use.' },
    ],
    go: [{ label: 'Open Integrations', section: 'settings', page: 'integrations' }],
    keywords: 'firecrawl searxng browser career-ops update docker skills',
  },
  {
    id: 'settings', group: 'configure', title: 'Settings map', icon: 'settings',
    summary: 'Thirteen pages in five groups. This is where to find each control.',
    when: ['You know what you want to change but not where it lives.'],
    steps: [
      { title: 'Basics', body: 'General: career-ops folder, theme, language, refresh cadence and update checks.' },
      { title: 'AI', body: 'Runners & models, API keys, Local models.' },
      { title: 'Connections', body: 'Integrations.' },
      { title: 'Workflows', body: 'Jobs & boards, Resume & documents, Agent, Copilot, Interview prep, Monitoring.' },
      { title: 'System', body: 'Data & privacy (what is stored and how to clear it) and Advanced (diagnostics and resets).' },
    ],
    tips: ['Settings has its own search. A dot on the Settings item means something needs your attention.'],
    go: [{ label: 'Open Settings', section: 'settings' }, { label: 'Data & privacy', section: 'settings', page: 'data' }],
    keywords: 'preferences options theme dark light language reset privacy retention diagnostics',
  },
]

export const REFERENCE: Topic[] = [
  {
    id: 'shortcuts', group: 'reference', title: 'Keyboard shortcuts', icon: 'zap',
    summary: 'Every screen is one chord away.',
    when: ['You want to move without the mouse.'],
    steps: [],
    keys: [
      { k: '{mod}K', label: 'Command palette: jump to a screen, run a mode, open a role or paste a job link to evaluate' },
      { k: '{mod}1', label: 'Overview' }, { k: '{mod}2', label: 'Jobs' }, { k: '{mod}3', label: 'Boards' },
      { k: '{mod}4', label: 'Resume' }, { k: '{mod}5', label: 'Agent' }, { k: '{mod}6', label: 'Monitoring' },
      { k: '{mod}7', label: 'Runs' }, { k: '{mod}8', label: 'Copilot' }, { k: '{mod},', label: 'Settings' },
      { k: '{mod}B', label: 'Collapse or expand the sidebar' },
      { k: '/', label: 'Search this help' },
    ],
    keywords: 'hotkeys keys chords command palette',
  },
  {
    id: 'troubleshooting', group: 'reference', title: 'Troubleshooting', icon: 'triangle-alert',
    summary: 'Fixes for the problems people hit most.',
    when: ['Something does not work and you want the quickest fix.'],
    steps: [],
    faq: [
      { q: 'A runner says it is not ready.', a: 'Open Settings › Runners & models. The row says whether the CLI is missing or signed out. Install it or run its login command in a terminal, then re-select your career-ops folder to re-check.' },
      { q: 'A board returns no jobs.', a: 'Check Boards for a missing requirement (Firecrawl or a browser session) and open its last scan in Runs to read the log. Some boards block automated reads.' },
      { q: 'The model dropdown is empty.', a: 'Add the provider’s key in Settings › API keys. If the list still fails, use Retry, or type a model id by hand.' },
      { q: 'Scores look wrong after I edited my résumé.', a: 'Scores come from the profile at evaluation time. Re-evaluate the jobs you care about.' },
      { q: 'Copilot is missing from the sidebar.', a: 'Copilot is available on macOS and Windows only.' },
      { q: 'Where is my data?', a: 'In your career-ops folder plus a small app-data folder. Settings › Data & privacy lists every location and can clear it.' },
      { q: 'macOS or Windows warns about an unsigned app.', a: 'Builds are not code-signed yet. On macOS right-click the app and choose Open; on Windows choose More info › Run anyway.' },
    ],
    keywords: 'problem error fix faq help not working',
  },
]
