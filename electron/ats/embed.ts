// Semantic similarity between JD requirements and résumé bullets through the local encoder (the pre-screen model).
// null = the model is not installed (or cannot run now): the match score then runs in degraded mode.
import path from 'node:path'

import { userFile } from '../context'
import { runSidecar, sidecarScript } from '../fit-sidecar'
import { assertMemory, findRuntime } from '../prescreen-model'
import type { JdReq } from './llm'

export type SimCall = (body: { cmd: 'sim'; queries: string[]; docs: string[] }) => Promise<{ best: number[] }>

/** requirement id → cosine of its best bullet. `call` is injected so the logic is testable without Python. */
export async function similarities(reqs: JdReq[], bullets: string[], call: SimCall | null): Promise<Record<string, number> | null> {
  if (!call || !reqs.length || !bullets.length) return null
  try {
    const { best } = await call({ cmd: 'sim', queries: reqs.map(r => r.text), docs: bullets })
    if (best.length !== reqs.length || best.some(n => typeof n !== 'number' || Number.isNaN(n))) return null
    return Object.fromEntries(reqs.map((r, i) => [r.id, best[i]!]))
  } catch {
    return null
  }
}

/** The real call: the installed local model, or null when it is absent. */
export function localSimCall(): SimCall | null {
  const rt = findRuntime()
  if (!rt) return null
  const dir = userFile('fit')
  return async body => {
    await assertMemory()
    return runSidecar(rt.python, [sidecarScript(dir)], { ...body, model: rt.model, weights: rt.weights, cache: path.join(dir, 'cache') })
  }
}
