import { createRoot } from 'react-dom/client'

import type { Suggestion } from '../../electron/contract'
import { SuggestionCard } from '../../renderer/overlay/SuggestionCard'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '../../renderer/overlay/window.css'
import '../../renderer/overlay/overlay.css'

const q = new URLSearchParams(location.search)
const theme = q.get('theme') ?? 'dark'
const s: Suggestion = {
  questionId: 'q1', model: 'fake', tier: 'fast', done: true, firstTokenMs: 200, totalMs: 900, costUsd: 0.0002, flags: [],
  say: 'I led our Kubernetes migration of 40 services and cut deploy time by 60%.',
  bullets: ['Started with a pilot on three low-risk services', 'Moved the rest in waves with automated rollback', 'Documented the runbook for the other teams'],
  star: null, proof: [{ quote: 'Led the Kubernetes migration of 40 services, cutting deploy time by 60%', source: 'cv.md' }],
  kb: [
    { id: 'a', text: 'Walk me through a zero-downtime migration', sourceId: 's1', source: 'Engineering blog' },
    { id: 'b', text: 'How do you decide what to migrate first?', sourceId: null, source: null },
  ],
}
createRoot(document.getElementById('root')!).render(<div className="ov" data-theme={theme} style={{ margin: 16 }}><SuggestionCard s={q.has('none') ? { ...s, kb: undefined } : s} /></div>)
