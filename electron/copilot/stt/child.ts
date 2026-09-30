import { spawn, type ChildProcess } from 'node:child_process'

import type { SidecarChild } from './sidecar'
import type { SttRuntime } from './runtime'

const live = new Set<ChildProcess>()
/** Kill running STT sidecars (session stop, app quit). */
export const killSttSidecars = () => { for (const c of live) c.kill('SIGKILL') }

/** `python script serve` over stdin/stdout for a finished install; stderr is dropped. */
export function spawnSidecarChild(rt: SttRuntime, env?: NodeJS.ProcessEnv): SidecarChild {
  const c = spawn(rt.python, [rt.script, 'serve'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: env ? { ...process.env, ...env } : process.env })
  live.add(c)
  c.on('exit', () => live.delete(c))
  c.stdin.on('error', () => {}) // EPIPE after a crash is reported through exit
  return {
    write: b => void c.stdin.write(b),
    onData: cb => void c.stdout.on('data', cb),
    onExit: cb => void c.on('exit', cb),
    kill: () => void c.kill('SIGKILL'),
  }
}
