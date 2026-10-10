import type { Topic } from './types'

export const START: Topic[] = [
  {
    id: 'welcome', group: 'start', title: 'How Careerloom works', icon: 'info',
    summary: 'Careerloom turns a pile of job listings into a short list you can act on, with an AI agent doing the slow parts on your machine.',
    when: ['You are new and want the whole picture in two minutes.', 'You are not sure which screen to open next.'],
    steps: [
      { title: 'Collect', body: 'Boards pull listings from company career pages and job sites into one pipeline.' },
      { title: 'Narrow', body: 'Pre-screen sorts jobs by location, function and seniority so you only pay to evaluate the plausible ones.' },
      { title: 'Evaluate', body: 'The agent reads a job against your profile and writes a scored report.' },
      { title: 'Prepare', body: 'For the jobs you keep: a tailored résumé and cover letter, an ATS check, a skill-gap plan and a question base for the interview.' },
      { title: 'Interview', body: 'Practise with an AI interviewer, or get live help in a real call with Copilot.' },
    ],
    tips: ['Everything is stored in a plain folder on your computer (your career-ops folder). Nothing is uploaded except the requests you send to the model provider you chose.'],
    go: [{ label: 'Open Overview', section: 'overview' }],
    keywords: 'intro overview pipeline flow concepts career-ops',
  },
  {
    id: 'setup', group: 'start', title: 'First-run setup', icon: 'zap',
    summary: 'A guided checklist that installs what Careerloom needs and points it at your career-ops folder.',
    when: ['First launch.', 'The app shows the setup screen again because a required tool went missing.'],
    steps: [
      { title: 'Install the tools', body: 'Careerloom checks for Node.js and Git and installs what it can. Wait for every row to show a tick.' },
      { title: 'Choose your career-ops folder', body: 'Pick an existing career-ops folder or let Careerloom install a fresh one. This is where your profile, pipeline and reports live.' },
      { title: 'Pick an agent', body: 'Choose a CLI you already have (Claude Code, Codex, Antigravity, OpenCode) or add an API key. OpenCode runs free models without an account.' },
      { title: 'Optional: local model', body: 'Installs the small on-device model that powers pre-screen scoring (about 1.4 GB, needs Python 3.10+). You can skip it and add it later in Settings › Local models.' },
      { title: 'Import your résumé', body: 'Upload a PDF or document. Careerloom extracts it into your profile, which every evaluation uses.' },
    ],
    tips: ['Moved the folder? Choose it again in Settings › General; Careerloom re-checks every CLI against it.'],
    go: [{ label: 'Open Settings › General', section: 'settings', page: 'general' }],
    keywords: 'onboarding install first launch folder bootstrap node git python',
  },
  {
    id: 'concepts', group: 'start', title: 'Words you will see', icon: 'tag',
    summary: 'A short glossary of the terms used on every screen.',
    when: ['A label or setting does not make sense.'],
    steps: [
      { title: 'Runner', body: 'The agent that does the work: Claude Code, Codex, Antigravity, OpenCode, OpenCode Zen (built in) or an API key through OpenRouter.' },
      { title: 'Model', body: 'The language model a runner uses. Each runner has its own list, fetched live from the provider or CLI.' },
      { title: 'Run', body: 'One task the agent performed: a scan, an evaluation, a résumé rewrite. Every run keeps a log, a cost and a status.' },
      { title: 'Board', body: 'A source of listings: a company careers page, a job site or any URL you add.' },
      { title: 'Pre-screen', body: 'A cheap, local sort of jobs into likely, needs agent and unlikely, before any paid evaluation.' },
      { title: 'Evaluation', body: 'The agent’s scored report on how well a job fits you. The score drives the Jobs table and the Match tab.' },
      { title: 'ATS', body: 'Applicant tracking system. Careerloom scores how readable your résumé is to one (parse health) and how well it matches a given job.' },
    ],
    keywords: 'glossary terminology runner model run board prescreen ats evaluation',
  },
]

export const FIND: Topic[] = [
  {
    id: 'overview', group: 'find', title: 'Overview', icon: 'layout-dashboard',
    summary: 'Your search at a glance: how many jobs sit in each stage, what ran recently and what to do next.',
    when: ['You open the app and want to know where you left off.', 'You want to spot a stuck stage, such as many unevaluated jobs.'],
    steps: [
      { title: 'Read the flow', body: 'The stage chart shows how jobs move from found to evaluated to applied. A thick, stalled band is where to work next.' },
      { title: 'Check recent activity', body: 'The activity view shows which days you and the agent were busy.' },
      { title: 'Jump in', body: 'Click a stage or card to land on the matching screen with that view applied.' },
    ],
    go: [{ label: 'Open Overview', section: 'overview' }],
    keywords: 'dashboard home funnel sankey stages',
  },
  {
    id: 'boards', group: 'find', title: 'Boards', icon: 'layout-grid',
    summary: 'Where listings come from. Turn boards on, add your own and scan them.',
    when: ['You want fresh listings.', 'A company you like is missing from your pipeline.', 'A board stopped returning jobs.'],
    steps: [
      { title: 'Start from the starter pack', body: 'The India starter pack adds 24 popular boards grouped into Common, Tech, Finance and Consulting. Each is off until you enable it.' },
      { title: 'Enable the boards you want', body: 'Switch on a handful first. Large boards can return thousands of listings.' },
      { title: 'Add any board', body: 'Choose Add board and paste a listing URL. Careerloom reads it with Firecrawl, the page’s structured data or the agent, whichever works.' },
      { title: 'Scan', body: 'Use New scan to pick which boards to scan, or scan from a board’s row. Progress shows in Runs; the Scans tab keeps history.' },
      { title: 'Login-walled boards', body: 'Opt in to reading a site in a browser with your own session. It is read-only and off by default.' },
    ],
    tips: ['Boards that need Firecrawl or a browser session show what is missing; fix it in Settings › Integrations.'],
    go: [{ label: 'Open Boards', section: 'boards' }, { label: 'Integrations', section: 'settings', page: 'integrations' }],
    keywords: 'scan portals sources greenhouse lever ashby workday firecrawl starter pack add url',
  },
  {
    id: 'jobs', group: 'find', title: 'Jobs', icon: 'list',
    summary: 'Every listing from every board in one table, with filters, pre-screen and evaluation.',
    when: ['You want to decide which jobs deserve an evaluation.', 'You want to review what the agent already scored.'],
    steps: [
      { title: 'Filter', body: 'Combine multi-select filters (company, location, score, stage) and save the result as a view.' },
      { title: 'Pre-screen', body: 'Run pre-screen on the visible jobs. They are tagged likely, needs agent or unlikely, using your policy (countries, remote, experience) then the local job-fit model. Mark 👍 or 👎 to teach it your taste.' },
      { title: 'Select', body: 'Tick the likely ones. Use the table or the board layout, whichever you prefer.' },
      { title: 'Evaluate', body: 'Choose Evaluate. The agent scores selected jobs one at a time; track it in Runs.' },
      { title: 'Track stages', body: 'Switch All jobs, Board or Table. The Board view groups tracked jobs as Evaluated, Applied, Responded, Interview, Offer and Closed; drag a card to move it. State and Views filters help you find stale or re-evaluable jobs.' },
      { title: 'Open a job', body: 'Click a row to open its Job page with the report, tailored documents and interview prep.' },
    ],
    tips: ['Evaluating 5,000 jobs costs real money. Pre-screen first, then evaluate a few dozen.', 'Jobs evaluated before your résumé last changed are marked; re-evaluate them to refresh scores.'],
    go: [{ label: 'Open Jobs', section: 'jobs' }, { label: 'Pre-screen settings', section: 'settings', page: 'jobs' }],
    keywords: 'table filters saved views bulk actions kanban board evaluate score prescreen thumbs',
  },
]
