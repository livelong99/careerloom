// Launches the user's Chrome/Edge with a private 0700 profile and a debugging port for the fast browser
// driver. Everything it creates (process, profile dir with cookies) is removed on finish, error, cancel and
// app exit; a startup sweep (sweepCookieTemp) catches a crash.
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const PROFILE_PREFIX = 'cl-bd-'
const START_TIMEOUT_MS = 20_000

export function browserCandidates(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((r): r is string => Boolean(r))
    return [
      ...roots.map(r => path.win32.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      ...roots.map(r => path.win32.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/microsoft-edge']
}

export function findBrowser(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = fs.existsSync): string | null {
  return browserCandidates(platform, env).find(exists) ?? null
}

export function launchArgs(profileDir: string, headless: boolean): string[] {
  return [
    `--user-data-dir=${profileDir}`, '--remote-debugging-port=0', '--remote-allow-origins=*',
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking',
    '--disable-extensions', '--window-size=1120,780',
    ...(headless ? ['--headless=new'] : []), 'about:blank',
  ]
}

export type Launched = { wsUrl: string; close: () => void }
const live = new Set<Launched>()

/** Parses Chrome's DevToolsActivePort file: line 1 the port, line 2 the browser's websocket path. */
export function parseActivePort(text: string): string | null {
  const [port, wsPath] = text.split('\n')
  return /^\d+$/.test(port ?? '') && wsPath?.startsWith('/devtools/browser/') ? `ws://127.0.0.1:${port}${wsPath.trim()}` : null
}

export async function launchBrowser(bin: string, headless: boolean): Promise<Launched> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX)) // mkdtemp is 0700
  let child: ChildProcess | null = null
  const handle: Launched = {
    wsUrl: '',
    close: () => {
      live.delete(handle)
      if (child && child.exitCode === null) child.kill('SIGKILL')
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* in use: the startup sweep retries */ }
    },
  }
  live.add(handle)
  try {
    child = spawn(bin, launchArgs(dir, headless), { stdio: 'ignore' })
    const exited = new Promise<never>((_, reject) => child!.once('exit', () => reject(new Error('The browser exited before it was ready'))))
    const portFile = path.join(dir, 'DevToolsActivePort')
    const ready = (async () => {
      const deadline = Date.now() + START_TIMEOUT_MS
      while (Date.now() < deadline) {
        try { const ws = parseActivePort(fs.readFileSync(portFile, 'utf8')); if (ws) return ws } catch { /* not written yet */ }
        await new Promise(r => setTimeout(r, 100))
      }
      throw new Error('The browser didn\'t start in time')
    })()
    handle.wsUrl = await Promise.race([ready, exited])
    return handle
  } catch (err) {
    handle.close()
    throw err
  }
}

/** Kill every browser this process started (app quit). */
export function killAllBrowsers(): void { for (const h of [...live]) h.close() }
process.on('exit', killAllBrowsers)
