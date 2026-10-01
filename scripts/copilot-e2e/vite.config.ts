import { defineConfig } from 'vite'

// Builds the harness page with the real capture code; `base: './'` so it loads over file:// like the app.
export default defineConfig({ root: 'scripts/copilot-e2e', base: './', build: { outDir: process.env.E2E_OUT || '../../dist/e2e', emptyOutDir: true } })
