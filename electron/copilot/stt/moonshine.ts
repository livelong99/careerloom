import type { SttDevice } from '../types'
import type { SttAdapter } from './adapter'
import { spawnSidecarChild } from './child'
import { findSttRuntime, type SttRuntime } from './runtime'
import { createSidecarAdapter } from './sidecar'

export { killSttSidecars } from './child'

/** ONNX execution provider for the sidecar; 'auto' = CPU (CoreML is absent from the 0.1.5 macOS wheel). */
export const providerFor = (d: SttDevice) => (d === 'coreml' ? 'CoreML' : d === 'cuda' ? 'CUDA' : 'cpu')

export function moonshineAdapter(model: string, device: SttDevice, rt: SttRuntime | null = findSttRuntime('moonshine')): SttAdapter {
  return createSidecarAdapter({
    id: 'moonshine',
    config: () => ({ model, provider: providerFor(device), cache: rt?.cache }),
    spawn() {
      if (!rt) throw new Error('Local speech model is not installed')
      return spawnSidecarChild(rt)
    },
  })
}
