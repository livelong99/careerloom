import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only harness: `npx vite --config scripts/kb-wp7-shots/vite.config.ts` (port 5199)
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../renderer', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5199, strictPort: true, fs: { allow: ['../..'] } },
})
