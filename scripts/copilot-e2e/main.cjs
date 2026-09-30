// Dev-only harness (no product code): runs the real session controller + Moonshine sidecar behind the real
// mic capture pipeline. Fake-device flags feed a WAV as the "microphone" so no TCC prompt is needed.
//   node scripts/copilot-e2e/main.cjs is NOT how it runs; use run.sh (electron main.cjs with flags).
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const root = path.join(__dirname, '..', '..')
const { createSessionController } = require(path.join(root, 'dist/electron/copilot/session.js'))
const { createSttAdapter } = require(path.join(root, 'dist/electron/copilot/stt/engines.js'))
const { killSttSidecars } = require(path.join(root, 'dist/electron/copilot/stt/moonshine.js'))

const t0 = Date.now()
const log = (...a) => console.log(`[${String(Date.now() - t0).padStart(6)}ms]`, ...a)
const RUN_MS = Number(process.env.E2E_MS || 12000)

app.whenReady().then(async () => {
  const session = createSessionController({
    createAdapter: () => createSttAdapter({ engine: 'moonshine', model: process.env.E2E_MODEL || 'small', device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
    stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
    emit: (ev, p) => { if (ev !== 'copilotLevel') log(ev, JSON.stringify(p)) },
  })
  ipcMain.on('careerloom:copilotAudio', (_e, m) => session.audio(m))
  ipcMain.on('h:log', (_e, s) => log('page:', s))
  await session.start({ mode: 'practice', jobId: 'qa', interviewType: 'mixed', consent: null })
  const win = new BrowserWindow({ width: 400, height: 200, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true } })
  await win.loadFile(process.env.E2E_PAGE)
  setTimeout(async () => { await session.stop('user'); killSttSidecars(); log('done'); app.quit() }, RUN_MS)
})
