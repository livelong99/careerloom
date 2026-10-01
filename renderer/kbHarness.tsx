// Dev-only static harness for QA screenshots: the KB tab on the app's styles with the fake backend (not part of the build inputs).
// /kbHarness.html?fakeKb=ready&theme=dark&open=0
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/indigo.css'
import './styles/plain.css'
import './styles/careerloom.css'
import './styles/tw.css'

const q = new URLSearchParams(location.search)
;(window as unknown as { careerloom: object }).careerloom = { platform: 'darwin', revealPath: async () => true }

const { applyTheme } = await import('./lib/theme')
const { KnowledgeTab } = await import('./components/job/KnowledgeTab')
const theme = q.get('theme')
applyTheme(theme === 'dark' || theme === 'light' ? theme : 'system')

createRoot(document.getElementById('root')!).render(
  <div className="mx-auto max-w-[1280px] bg-[var(--page)] text-foreground">
    <div className="px-5 pb-0 pt-3.5"><h2 className="m-0 text-[17px] font-bold">Senior Backend Engineer <small className="font-normal text-muted-foreground">Northwind Payments · Bengaluru · Hybrid</small></h2></div>
    <div className="border-b border-border px-5 pt-2 text-sm text-muted-foreground">Overview · Job · Match · Skill-up · Documents · Report · <b className="text-foreground">Knowledge base</b></div>
    <KnowledgeTab jobId="job-1" jobTitle="Senior Backend Engineer" />
  </div>,
)
const open = q.get('open')
if (open !== null) setTimeout(() => document.querySelectorAll<HTMLElement>('tbody tr')[Number(open)]?.click(), 600)
