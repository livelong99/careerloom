import './mock'

import { createRoot } from 'react-dom/client'

import { GOTO_EVENT, setSelection } from '@/components/copilot/selection'
import { Overlay } from '@/overlay/Overlay'
import { Copilot } from '@/sections/Copilot'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@/styles/indigo.css'
import '@/styles/plain.css'
import '@/styles/careerloom.css'
import '@/styles/tw.css'
import '@/overlay/window.css'

const q = new URLSearchParams(location.search)
const emit = (window as unknown as { __emit: (n: string, p: unknown) => void }).__emit
document.documentElement.dataset.theme = q.get('theme') ?? 'dark'
document.documentElement.dataset.platform = 'darwin'
setSelection({ jobId: 'j1', interviewType: 'mixed' })

if (q.get('view') === 'overlay') {
  document.body.style.background = q.get('theme') === 'light' ? '#e8eaee' : '#161b24'
  createRoot(document.getElementById('root')!).render(<Overlay />)
  const state = q.get('phase') ?? 'speaking'
  setTimeout(() => {
    emit('copilotState', { state: 'listening', mode: 'practice', sessionId: 's1', sources: ['mic'], startedAt: Date.now() - 750_000 })
    emit('copilotQuestion', { id: 'k1', text: 'How would you design an idempotent payment-capture flow when the card network times out?', type: 'system-design', confidence: 1, at: Date.now(), auto: true })
    emit('interviewerState', { state, questionId: 'k1', voice: 'Aman' })
    if (state === 'listening') emit('copilotTranscript', { id: 'y1', speaker: 'you', text: '…so the key is written first, and if the network call times out we do not assume it failed…', final: false, t0: 1, t1: null })
    emit('copilotSuggestion', { questionId: 'k1', model: 'm', tier: 'balanced', say: 'Lead with idempotency keys stored before the call.', bullets: ['Ask what "timeout" means: unknown outcome, not failure', 'Retry with backoff, then reconcile with the network', 'Name the trade-off: latency against certainty'], star: null, proof: [{ source: 'cv.md', quote: 'Ledger migration, 2023' }], flags: [], done: true, firstTokenMs: 400, totalMs: 900, costUsd: 0.001 })
  }, 400)
} else {
  createRoot(document.getElementById('root')!).render(<div className="body" style={{ height: '100vh', display: 'flex' }}><Copilot /></div>)
  setTimeout(() => window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: q.get('page') ?? 'practice' })), 300)
}
