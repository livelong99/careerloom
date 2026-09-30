import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './window.css'
import { Overlay } from './Overlay'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')
createRoot(root).render(<StrictMode><Overlay /></StrictMode>)
