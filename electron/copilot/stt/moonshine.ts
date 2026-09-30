import { spawn, type ChildProcess } from 'node:child_process'

import type { SttDevice } from '../types'
import type { SttAdapter } from './adapter'
import { findSttRuntime, type SttRuntime } from './install'
import { createSidecarAdapter } from './sidecar'

const live = new Set<ChildProcess>()
/** Kill running STT sidecars (session stop, app quit). */
export const killSttSidecars = () => { for (const c of live) c.kill('SIGKILL') }

/** ONNX execution provider for the sidecar; 'auto' = CPU (CoreML is absent from the 0.1.5 macOS wheel). */
export const providerFor = (d: SttDevice) => (d === 'coreml' ? 'CoreML' : d === 'cuda' ? 'CUDA' : 'cpu')

export function moonshineAdapter(model: string, device: SttDevice, rt: SttRuntime | null = findSttRuntime('moonshine')): SttAdapter {
  return createSidecarAdapter({
    id: 'moonshine',
    config: () => ({ model, provider: providerFor(device), cache: rt?.cache }),
    spawn() {
      if (!rt) throw new Error('Local speech model is not installed')
      const c = spawn(rt.python, [rt.script, 'serve'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
      live.add(c)
      c.on('exit', () => live.delete(c))
      c.stdin.on('error', () => {}) // EPIPE after a crash is reported through exit
      return {
        write: b => void c.stdin.write(b),
        onData: cb => void c.stdout.on('data', cb),
        onExit: cb => void c.on('exit', cb),
        kill: () => void c.kill('SIGKILL'),
      }
    },
  })
}
