// Spike S1 harness: can an Electron window capture macOS system audio?
//   variant "loopback": setDisplayMediaRequestHandler({audio:'loopback'}) + getDisplayMedia
//   variant "picker":   { useSystemPicker:true } (needs a human click; only reports that it was reached)
// Plays a short clip with afplay while measuring per-second peak of the captured track.
const { app, BrowserWindow, ipcMain, session, desktopCapturer, systemPreferences } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const variant = process.env.S1_VARIANT || 'loopback'
const t0 = Date.now()
const log = (...a) => console.log(`[${String(Date.now() - t0).padStart(6)}ms]`, ...a)

app.whenReady().then(async () => {
  log('electron', process.versions.electron, 'chrome', process.versions.chrome, 'screen perm:', systemPreferences.getMediaAccessStatus('screen'), 'mic perm:', systemPreferences.getMediaAccessStatus('microphone'))
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      log('handler: screens', sources.length)
      if (!sources[0]) return cb({})
      cb({ video: sources[0], audio: 'loopback' })
    } catch (e) { log('handler error', e.message); cb({}) }
  }, variant === 'picker' ? { useSystemPicker: true } : undefined)
  ipcMain.on('h:log', (_e, s) => log('page:', s))
  ipcMain.on('h:play', () => { log('afplay start'); spawn('afplay', ['-v', '0.25', process.env.S1_CLIP]).on('exit', () => log('afplay end')) })
  const win = new BrowserWindow({ width: 300, height: 200, show: false, webPreferences: { preload: path.join(__dirname, 'preload-s1.cjs'), contextIsolation: true } })
  await win.loadFile(path.join(__dirname, 's1.html'))
  setTimeout(() => { log('done'); app.quit() }, Number(process.env.S1_MS || 12000))
})
