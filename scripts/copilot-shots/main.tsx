import './mock'

import { createRoot } from 'react-dom/client'

import { GOTO_EVENT, setSelection } from '@/components/copilot/selection'
import { Copilot } from '@/sections/Copilot'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@/styles/indigo.css'
import '@/styles/plain.css'
import '@/styles/careerloom.css'
import '@/styles/tw.css'

const q = new URLSearchParams(location.search)
document.documentElement.dataset.theme = q.get('theme') ?? 'dark'
document.documentElement.dataset.platform = 'darwin'
setSelection({ jobId: 'j1', interviewType: 'behavioural' })

createRoot(document.getElementById('root')!).render(<div className="body" style={{ height: '100vh', display: 'flex' }}><Copilot /></div>)

const click = (sel: string, text?: RegExp): void => { const el = [...document.querySelectorAll<HTMLElement>(sel)].find(e => !text || text.test(e.textContent ?? '') || text.test(e.getAttribute('aria-label') ?? '')); el?.click() }
setTimeout(() => {
  window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: q.get('page') ?? 'setup' }))
  if (q.has('gate')) setTimeout(() => {
    click('button', /Start live session/)
    if (q.has('checked')) setTimeout(() => { document.querySelectorAll<HTMLElement>('[role=dialog] [role=checkbox]').forEach(c => c.click()) }, 300)
  }, 400)
  if (q.has('notice')) setTimeout(() => click('[role=switch]', /Privacy mode/), 500)
}, 300)
