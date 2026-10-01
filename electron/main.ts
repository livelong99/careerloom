import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import { checkRoot, listReports, readPipeline, readReport, readTracker } from './careerops'
import { broadcast, dataRoot, launch, setSkillContext, readRunHistory, readSettings, runLog, runs, startAgent, str, summary, writeSettings, type Handler } from './context'
import { chatHandlers } from './chat'
import { onboardingHandlers } from './onboarding'
import { prescreenHandlers, stopPrescreen } from './prescreen'
import { integrationsHandlers } from './integrations'
import { jobsHandlers } from './jobs'
import { firecrawlReady, firecrawlScrape } from './integrations/firecrawl'
import { readRegistry } from './integrations/registry'
import { metricsHandlers } from './metrics'
import { atsHandlers } from './ats/handlers'
import { jobViewHandlers } from './job-view/handlers'
import { docsHandlers } from './docs-gen/handlers'
import { copilotHandlers } from './copilot/handlers'
import { pruneRunLogs, publicSettings, settingsHandlers } from './settings/handlers'
import { setKey } from './settings/keys'
import { isAllowedPermission } from './copilot/audio-perms'
import { copilotSupported } from './copilot/capabilities'
import { copilotAudioIn } from './copilot/defaults'
import { startFakeOverlayIfRequested } from './copilot/overlay-runtime'
import { killSttSidecars } from './copilot/stt/moonshine'
import { resumeHandlers } from './resume'
import { trackerHandlers } from './tracker-actions'
import { checkReadiness, pickReadyRunner, type Readiness } from './readiness'
import { zenModels } from './opencode'
import { sweepCookieTemp } from './integrations/browser-cookies'
import { createUpdateChecker, type UpdateChecker } from './updates'
import { cancelAll, cancelRun, isMode, isModelId, isRunner, MODES, resolveBin, spawnSpec } from './runner'
import { execFile } from 'node:child_process'

// Handlers resolve with { ok, value } | { ok, error } so a structured error
// survives the contextBridge boundary (pattern kept from codeburn).
export type Envelope<T = unknown> = { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }

const CAREER_OPS_REPO = 'https://github.com/career-ops-hq/career-ops.git'
let updateChecker: UpdateChecker | null = null
let readiness: Readiness | null = null

/** Validate every CLI against the chosen folder and prepare their headless setup. If the
 *  active runner can't run but another CLI can, switch to it. Broadcasts the result. */
async function refreshReadiness(): Promise<Readiness | null> {
  const { root, runner } = readSettings()
  const check = root ? checkRoot(root) : null
  if (!check?.ok) { readiness = null; return null }
  const skills = readRegistry().skills.filter(s => s.enabled && fs.existsSync(s.path)).map(s => s.path)
  readiness = await checkReadiness(check.root, skills)
  const next = pickReadyRunner(runner, readiness)
  if (next) {
    writeSettings({ runner: next })
    broadcast('careerloom:settings', null)
  }
  broadcast('careerloom:readiness', { readiness, switchedTo: next })
  return readiness
}

let opencodeModels: Array<{ id: string; label: string }> | null = null
/** `opencode models` prints one provider/model id per line. */
function listOpencodeModels(): Promise<Array<{ id: string; label: string }>> {
  if (opencodeModels) return Promise.resolve(opencodeModels)
  const bin = resolveBin('opencode')
  if (!bin) return Promise.resolve([])
  return new Promise(resolve => {
    execFile(bin, ['models'], { timeout: 30_000, env: spawnSpec('opencode', []).env }, (err, stdout) => {
      if (err) return resolve([])
      opencodeModels = stdout.split('\n').map(l => l.trim()).filter(id => id.includes('/') && isModelId(id)).map(id => ({ id, label: id }))
      resolve(opencodeModels)
    })
  })
}

/** Env every agent run gets: the local Firecrawl endpoint, when it is up. */
async function agentEnv(): Promise<NodeJS.ProcessEnv> {
  return (await firecrawlReady()) ? { FIRECRAWL_URL: readRegistry().firecrawl.url } : {}
}

const JD_CAP = 18_000

// Suggestions for the model pickers. Free text is still allowed (any id the CLI accepts).
const MODEL_SUGGESTIONS: Record<'claude' | 'codex', Array<{ id: string; label: string }>> = {
  claude: [
    { id: 'sonnet', label: 'Sonnet (latest)' },
    { id: 'opus', label: 'Opus (latest)' },
    { id: 'haiku', label: 'Haiku (latest, cheapest)' },
  ],
  codex: [
    { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'o3', label: 'o3' },
  ],
}
let agyModels: Array<{ id: string; label: string }> | null = null

/** `agy models` prints `id<TAB>label` lines; cached for the session. */
function antigravityModels(): Promise<Array<{ id: string; label: string }>> {
  if (agyModels) return Promise.resolve(agyModels)
  const bin = resolveBin('agy')
  if (!bin) return Promise.resolve([])
  return new Promise(resolve => {
    execFile(bin, ['models'], { timeout: 15_000, env: spawnSpec('agy', []).env }, (err, stdout) => {
      if (err) return resolve([])
      agyModels = stdout.split('\n').map(l => l.split('\t')).filter(([id]) => isModelId(id?.trim())).map(([id, label]) => ({ id: id!.trim(), label: (label ?? id!).trim() }))
      resolve(agyModels)
    })
  })
} // stays under promptFor's 20k input ceiling

// Feature modules own their handlers; names must not collide (checked at registration).
const FEATURES: Array<Record<string, Handler>> = [resumeHandlers, metricsHandlers, integrationsHandlers, trackerHandlers, jobsHandlers, chatHandlers, onboardingHandlers, prescreenHandlers, atsHandlers, jobViewHandlers, docsHandlers, copilotHandlers, settingsHandlers]

/** Folders returned by the native picker this session; setRoot accepts only these. */
const pickedDirs = new Set<string>()

const handlers: Record<string, Handler> = {
  getSettings: () => {
    return publicSettings()
  },
  setRoot: (root: unknown) => {
    // Only folders the user picked in the native dialog (or the current one) — never a raw renderer path.
    const dir = str(root, 'root')
    if (!pickedDirs.has(dir) && dir !== readSettings().root) throw new Error('Choose the folder with the Browse button')
    const check = checkRoot(dir)
    if (!check.ok) throw new Error(check.reason)
    writeSettings({ root: check.root })
    void refreshReadiness().catch(err => console.error('readiness check failed:', err))
    return check
  },
  setRunner: (runner: unknown) => {
    if (!isRunner(runner)) throw new Error('Unknown runner')
    return writeSettings({ runner })
  },
  setModel: (runner: unknown, model: unknown) => {
    if (!isRunner(runner) || runner === 'api') throw new Error('Pick an agent runner')
    if (model !== null && !isModelId(model)) throw new Error('Model ids are letters, digits and . _ : / @ - (up to 100 characters)')
    const { models } = readSettings()
    const next = { ...models }
    if (model === null || model === '') delete next[runner]
    else next[runner] = model
    return writeSettings({ models: next })
  },
  listModels: (runner: unknown) => {
    if (runner === 'antigravity') return antigravityModels()
    if (runner === 'opencode') return listOpencodeModels()
    if (runner === 'zen') return zenModels()
    if (runner === 'claude' || runner === 'codex') return MODEL_SUGGESTIONS[runner]
    throw new Error('Unknown runner')
  },
  setApiKey: (key: unknown, provider: unknown) => {
    return setKey(provider === 'opencode' ? 'opencode' : 'openrouter', key === null ? null : str(key, 'key')).hasKey
  },
  chooseDirectory: async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    const dir = res.canceled ? null : res.filePaths[0] ?? null
    if (dir) pickedDirs.add(dir)
    return dir
  },
  runnerStatus: () => ({
    claude: resolveBin('claude'),
    codex: resolveBin('codex'),
    antigravity: resolveBin('agy'),
    opencode: resolveBin('opencode'),
    node: resolveBin('node'),
    git: resolveBin('git'),
  }),
  /** Cached per-CLI readiness for the current folder; `force` re-probes (a few seconds). */
  getReadiness: async (force: unknown) => (force === true || !readiness || readiness.root !== readSettings().root ? refreshReadiness() : readiness),
  modes: () => MODES,
  profileStatus: () => {
    const base = dataRoot()
    const has = (rel: string) => fs.existsSync(path.join(base, rel))
    return { cv: has('cv.md'), profile: has('config/profile.yml'), portals: has('portals.yml') }
  },
  getTracker: () => readTracker(dataRoot()),
  getPipeline: () => readPipeline(dataRoot()),
  listReports: () => listReports(dataRoot()),
  readReport: (rel: unknown) => readReport(dataRoot(), str(rel, 'report')),
  // Switched off in Settings → never touch the network on the renderer's behalf; "Check now" is explicit and still works.
  getUpdateStatus: () => (readSettings().prefs.updates.enabled ? updateChecker?.getStatus() : updateChecker?.peek()) ?? { currentVersion: app.getVersion(), latestVersion: null, updateAvailable: false, tag: null },
  checkForUpdates: async () => {
    const status = (await updateChecker?.check()) ?? { currentVersion: app.getVersion(), latestVersion: null, updateAvailable: false, tag: null }
    broadcast('careerloom:update', status)
    return status
  },
  listRuns: () => {
    const live = [...runs.values()].map(summary)
    const ids = new Set(live.map(r => r.id))
    return [...readRunHistory().filter(r => !ids.has(r.id)), ...live].reverse()
  },
  getRunLog: (id: unknown) => runLog(str(id, 'id')),
  cancelRun: (id: unknown) => {
    const run = runs.get(str(id, 'id'))
    if (!run || run.status !== 'running') return false
    run.status = 'cancelled'
    return cancelRun(run.id)
  },
  startRun: async (req: unknown) => {
    const { mode, input } = (req ?? {}) as { mode?: unknown; input?: unknown }
    if (!isMode(mode)) throw new Error('Unknown mode')
    return startAgent(mode, input === undefined || input === null ? undefined : str(input, 'input'), await agentEnv())
  },
  /** Evaluate a pasted link or JD. With Firecrawl up, the page is fetched first so
   *  JS-rendered boards (Workday, iCIMS…) reach the agent as text, not an empty shell. */
  evaluateJob: async (input: unknown) => {
    const text = str(input, 'input').trim()
    const env = await agentEnv()
    if (/^https?:\/\/\S+$/i.test(text) && env.FIRECRAWL_URL) {
      try {
        const page = await firecrawlScrape(text)
        if (page.markdown.trim()) {
          return startAgent('evaluate', `Job posting ${page.url} (fetched via Firecrawl):\n\n${page.markdown.slice(0, JD_CAP)}`, env)
        }
      } catch (err) {
        console.error('Firecrawl prefetch failed, evaluating the URL directly:', err)
      }
    }
    return startAgent('evaluate', text, env)
  },
  /** Clone career-ops into `parent/career-ops`, install its deps, adopt it as root. */
  setupCareerOps: (parent: unknown) => {
    const target = path.join(str(parent, 'folder'), 'career-ops')
    if (fs.existsSync(target)) throw new Error(`${target} already exists — pick it as your folder instead`)
    const run = launch(
      { runner: 'setup', mode: 'setup', label: 'Install career-ops', input: target },
      [
        { spec: spawnSpec('git', ['clone', '--depth', '1', CAREER_OPS_REPO, target]), cwd: path.dirname(target) },
        { spec: spawnSpec('npm', ['install', '--no-audit', '--no-fund']), cwd: target },
      ],
      { onSuccess: () => { writeSettings({ root: target }); broadcast('careerloom:settings', null); void refreshReadiness().catch(err => console.error('readiness check failed:', err)) } },
    )
    return summary(run)
  },
}

/** Installed, enabled skills (Integrations) join career-ops as the agent's engine. */
function installSkillContext(): void {
  setSkillContext(() => {
    const skills = readRegistry().skills.filter(s => s.enabled && fs.existsSync(s.path))
    if (!skills.length) return { dirs: [], note: null }
    const list = skills.map(s => `- ${s.name}: ${s.path}${s.description ? ` — ${s.description}` : ''}`).join('\n')
    return {
      dirs: skills.map(s => s.path),
      note: `Besides career-ops (the working directory), these job-search skills are installed and readable. Use their SKILL.md / AGENTS.md when a task fits them:\n${list}`,
    }
  })
}

function registerHandlers(): void {
  installSkillContext()
  const all: Record<string, Handler> = { ...handlers }
  for (const feature of FEATURES) {
    for (const [name, fn] of Object.entries(feature)) {
      if (name in all) throw new Error(`Duplicate IPC handler: ${name}`)
      all[name] = fn
    }
  }
  for (const [name, fn] of Object.entries(all)) {
    ipcMain.handle(`careerloom:${name}`, async (_event, ...args: unknown[]): Promise<Envelope> => {
      try {
        return { ok: true, value: await fn(...args) }
      } catch (err) {
        return { ok: false, error: { kind: 'error', message: err instanceof Error ? err.message : String(err) } }
      }
    })
  }
  if (copilotSupported()) ipcMain.on('careerloom:copilotAudio', (_event, msg: unknown) => copilotAudioIn(msg)) // high-rate mic frames: send, not invoke
  ipcMain.handle('open-external', async (_event, url: unknown) => {
    const target = typeof url === 'string' ? externalUrlToOpen(url) : null
    if (target) await shell.openExternal(target)
  })
}

/** What the renderer may hand the shell: http(s) only. */
export function externalUrlToOpen(url: string): string | null {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:') return url
  } catch { /* malformed URL, refuse to open */ }
  return null
}

// ————— Window + app lifecycle (from codeburn) —————

function menuTemplate(isDev = Boolean(process.env.VITE_DEV_SERVER_URL)): MenuItemConstructorOptions[] {
  return [
    ...(process.platform === 'darwin'
      ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] } as MenuItemConstructorOptions]
      : [{ label: 'File', submenu: [{ role: 'quit' }] } as MenuItemConstructorOptions]),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(isDev ? [{ role: 'toggleDevTools' as const }] : [])] },
    { role: 'windowMenu' },
  ]
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0f14' : '#f4f3ef',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  // Only the bundled renderer ever loads; block navigation and popups.
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devUrl = process.env.VITE_DEV_SERVER_URL
  const load = devUrl ? win.loadURL(devUrl) : win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  load.catch(err => console.error('Failed to load renderer:', err))
  return win
}

function bootstrap(): void {
  // Windows groups taskbar entries and notifications by this id (must match build.appId).
  if (process.platform === 'win32') app.setAppUserModelId('app.careerloom.desktop')
  if (!app.requestSingleInstanceLock()) { app.quit(); return }
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })
  app.on('before-quit', () => { cancelAll(); stopPrescreen(); killSttSidecars() })
  void app.whenReady().then(() => {
    sweepCookieTemp() // plaintext cookie copies a crashed browser scan left behind
    registerHandlers()
    // Only our own pages may ask for the microphone; every other permission keeps Electron's default (allowed).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => cb(permission === 'media' ? isAllowedPermission(permission, details.requestingUrl) : true))
    void refreshReadiness().catch(err => console.error('readiness check failed:', err))
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()))
    createWindow()
    startFakeOverlayIfRequested() // dev only: CL_COPILOT_FAKE=cycle|<state>
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
    // Update availability (from codeburn): at launch, then daily. Notifies only — never installs.
    updateChecker = createUpdateChecker({ currentVersion: app.getVersion() })
    const runUpdateCheck = () => { if (readSettings().prefs.updates.enabled) void updateChecker?.check().then(status => broadcast('careerloom:update', status)) }
    runUpdateCheck()
    setInterval(runUpdateCheck, 24 * 60 * 60 * 1000)
    try { pruneRunLogs() } catch (err) { console.error('run-log retention failed:', err) } // no-op while retention is 'forever'
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}

if (!process.env.VITEST) bootstrap()
