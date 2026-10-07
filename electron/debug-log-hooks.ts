// Electron side of the debug log: console, crashes, renderer consoles and a startup snapshot. Installed once at launch;
// every hook is a no-op while no folder is set (see debug-log.ts).
import os from 'node:os'
import util from 'node:util'
import { app } from 'electron'
import { readApiKey, readSettings } from './context'
import { readCopilotConfig } from './copilot/config'
import { debugLog, debugLogDir, setDebugLogDir } from './debug-log'

let installed = false
const fmt = (a: unknown[]): string => a.map(x => (typeof x === 'string' ? x : util.inspect(x, { depth: 3, breakLength: Infinity }))).join(' ').slice(0, 4000)

function snapshot(): void {
  const cfg = (() => { try { return readCopilotConfig() } catch (e) { return { error: String(e) } } })()
  debugLog('app', 'environment', {
    version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, arch: process.arch, release: os.release(),
    electron: process.versions.electron, node: process.versions.node, locale: app.getLocale(), userData: app.getPath('userData'),
    totalMemGb: +(os.totalmem() / 1024 ** 3).toFixed(1), freeMemGb: +(os.freemem() / 1024 ** 3).toFixed(1),
    runner: readSettings().runner, hasOpenRouterKey: readApiKey() !== null, copilot: cfg,
  })
}

/** Install the hooks once (cheap while logging is off). */
export function installDebugHooks(): void {
  if (installed) return
  installed = true
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...a: unknown[]) => { if (debugLogDir()) debugLog('main.console', fmt(a), { level }); orig(...a) }
  }
  process.on('uncaughtExceptionMonitor', (err, origin) => debugLog('main.crash', origin, err))
  process.on('unhandledRejection', reason => { debugLog('main.crash', 'unhandledRejection', reason); console.error('Unhandled rejection:', reason) })
  app.on('child-process-gone', (_e, d) => debugLog('app', 'child process gone', d))
  app.on('render-process-gone', (_e, wc, d) => debugLog('app', 'renderer gone', { url: wc.getURL(), ...d }))
  app.on('web-contents-created', (_e, wc) => {
    wc.on('console-message', (...a: unknown[]) => {
      const first = a[0] as { level?: unknown; message?: unknown; sourceId?: unknown; lineNumber?: unknown } | undefined
      const d = first && typeof first === 'object' && 'message' in first ? first : { level: a[1], message: a[2], lineNumber: a[3], sourceId: a[4] }
      debugLog('renderer.console', String(d.message ?? ''), { level: d.level, at: `${String(d.sourceId ?? '')}:${String(d.lineNumber ?? '')}`, page: wc.getURL().replace(/[?#].*$/, '') })
    })
    wc.on('did-fail-load', (_e, code, desc, url) => debugLog('renderer', 'load failed', { code, desc, url }))
    wc.on('unresponsive', () => debugLog('renderer', 'unresponsive', { url: wc.getURL() }))
  })
}

/** Follow prefs.debug.dir: start or stop logging. Throws when the folder can't be written (Settings shows why). */
export function applyDebugLog(): void {
  const dir = readSettings().prefs.debug.dir
  const was = debugLogDir()
  setDebugLogDir(dir)
  if (dir && dir !== was) snapshot()
}
