import './mock'

import { createRoot } from 'react-dom/client'

import { EnginePage } from '@/sections/copilot/Engine'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@/styles/indigo.css'
import '@/styles/plain.css'
import '@/styles/careerloom.css'
import '@/styles/tw.css'

const q = new URLSearchParams(location.search)
document.documentElement.dataset.theme = q.get('theme') ?? 'dark'
document.documentElement.dataset.platform = 'darwin'
createRoot(document.getElementById('root')!).render(<div className="body" style={{ padding: 24, maxWidth: 980 }}><EnginePage /></div>)
// press Test on the first model row, as a user would
setTimeout(() => { [...document.querySelectorAll<HTMLElement>('button')].find(b => b.textContent === 'Test')?.click() }, 1200)
