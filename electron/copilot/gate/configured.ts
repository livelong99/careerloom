import type { Classify } from '../detector'
import type { CopilotConfig } from '../types'
import { gateClassify } from './classify'
import { createHeuristicGate } from './heuristic'
import { createJevGate } from './jev'
import { createGatePipeline } from './pipeline'

type Deps = { config: () => CopilotConfig; getKey: () => string | null; fetch?: typeof fetch }

/** The detector's classify slot while `engine.gate.engine` is 'jev': null result = not a question. Returns a function that
 *  re-reads the config per call (the setting can change mid-session), never calls out when privacy.localOnly is set, and is
 *  inert (no network) when the gate is off. The caller masks the text first (redaction) and keeps its own classifier for 'heuristic'. */
export function createConfiguredClassify(d: Deps): Classify {
  let built: { key: string; classify: Classify } | null = null
  const heuristic = createHeuristicGate()
  return async text => {
    const cfg = d.config()
    const g = cfg.engine.gate
    if (g.engine !== 'jev' || cfg.privacy.localOnly) return null
    const key = `${g.baseUrl}|${g.endpoint}`
    if (built?.key !== key) built = { key, classify: gateClassify(createGatePipeline({ heuristic, model: createJevGate({ baseUrl: g.baseUrl, endpoint: g.endpoint, getKey: d.getKey, fetch: d.fetch }) })) }
    return built.classify(text)
  }
}
