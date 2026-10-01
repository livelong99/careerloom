import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The production index.html ships a strict `script-src 'self'`. In dev, Vite's
// React Fast Refresh preamble is injected as an inline <script>, which that CSP
// blocks; relax script-src to allow inline scripts for the dev server only.
function devCsp(): Plugin {
  return {
    name: 'careerloom-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
    },
  }
}

// Renderer-only Vite config. The Electron main/preload are compiled separately
// by tsconfig.electron.json. `base: './'` so the built index.html loads its
// assets over file:// in production.
export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react(), tailwindcss(), devCsp()],
  // `@/` = renderer/, the alias the pulled shadcn components import through.
  resolve: { alias: { '@': fileURLToPath(new URL('./renderer', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  // Two pages: the app and the Interview Copilot overlay window (own bundle, none of the app's legacy CSS).
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
    rollupOptions: { input: { index: fileURLToPath(new URL('./renderer/index.html', import.meta.url)), overlay: fileURLToPath(new URL('./renderer/overlay.html', import.meta.url)) } },
  },
})
