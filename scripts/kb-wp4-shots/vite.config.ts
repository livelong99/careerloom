import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Screenshot harness server (dev only): `npx vite --config scripts/kb-wp4-shots/vite.config.ts`
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../renderer', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5198, strictPort: true, fs: { allow: ['../..'] } },
})
