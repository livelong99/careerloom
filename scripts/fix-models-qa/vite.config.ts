import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only harness: `npx vite --config scripts/fix-models-qa/vite.config.ts` (port 5198)
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../renderer', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5198, strictPort: true, fs: { allow: ['../..'] } },
})
