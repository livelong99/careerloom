import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

import { debugLog } from '../../debug-log'
import type { SidecarChild } from './sidecar'
import type { SttRuntime } from './runtime'

const live = new Set<ChildProcess>()
const STDERR_MAX_LINES = 200
/** Kill running STT sidecars (session stop, app quit). */
export const killSttSidecars = () => { for (const c of live) c.kill('SIGKILL') }

/** `python script serve` over stdin/stdout for a finished install; stderr goes to the debug log (a crash, a missing package, a CUDA failure all land there first). */
export function spawnSidecarChild(rt: SttRuntime, env?: NodeJS.ProcessEnv): SidecarChild {
  const c = spawn(rt.python, [rt.script, 'serve'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: env ? { ...process.env, ...env } : process.env })
  live.add(c)
  const name = path.basename(path.dirname(path.dirname(path.dirname(rt.python)))) // <engine>/venv/{bin,Scripts}/python
  c.stderr.setEncoding('utf8')
  let logged = 0
  c.stderr.on('data', (t: string) => {
    for (const l of t.split(/\r?\n/)) {
      if (!l.trim() || logged > STDERR_MAX_LINES) continue // a library that warns on every frame must not fill the log
      debugLog('stt', 'stderr', { engine: name, line: ++logged > STDERR_MAX_LINES ? `…further stderr lines not logged (cap ${STDERR_MAX_LINES})` : l.slice(0, 500) })
    }
  })
  c.on('error', err => debugLog('stt', 'spawn failed', { engine: name, message: err.message })) // ENOENT: the venv python is gone
  c.on('exit', (code, signal) => { live.delete(c); debugLog('stt', 'exit', { engine: name, code, signal }) })
  c.stdin.on('error', () => {}) // EPIPE after a crash is reported through exit
  return {
    write: b => void c.stdin.write(b),
    onData: cb => void c.stdout.on('data', cb),
    // A python that cannot start (venv deleted, antivirus) emits 'error' and no 'exit': report it as an exit so the adapter fails now, not after its ready timeout.
    onExit: cb => { let done = false; const once = (code: number | null) => { if (!done) { done = true; cb(code) } }; c.on('exit', once); c.on('error', () => once(null)) },
    kill: () => void c.kill('SIGKILL'),
  }
}
