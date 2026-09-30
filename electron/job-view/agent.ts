// One single-shot, text-only agent call: no file or shell tools, answers from the prompt alone.
// `helper` = the cheap model tier (structuring, humanizing); `main` = the runner's configured model.
import { readSettings, startAgentPrompt, type ModelRunner, type Settings } from '../context'
import type { ModelCall } from './jdStructure'

/** Cheapest verified option per runner (from each CLI's own model list); unset = the CLI default.
 *  zen: its own cheapest-paid fallback already applies when no model is chosen. */
export const DEFAULT_HELPER: Partial<Record<ModelRunner, string>> = {
  claude: 'haiku',
  opencode: 'opencode/mimo-v2.6-flash-free',
  antigravity: 'gemini-3.8-flash-low',
}

export function modelFor(s: Settings, tier: 'helper' | 'main'): string | undefined {
  if (s.runner === 'api') return undefined
  return tier === 'helper' ? s.helperModels[s.runner] ?? DEFAULT_HELPER[s.runner] : s.models[s.runner]
}

export function runText(prompt: string, o: { tier: 'helper' | 'main'; label: string }): ReturnType<ModelCall> {
  const model = modelFor(readSettings(), o.tier)
  return new Promise((resolve, reject) => {
    try {
      startAgentPrompt(o.label, 'job-view', prompt, null, {
        textOnly: true, neutral: true, model,
        onExit: r => r.status === 'done'
          ? resolve({ text: r.log, tokens: r.usage ? r.usage.inputTokens + r.usage.outputTokens : null, model: model ?? 'default' })
          : reject(new Error(`The agent run ${r.status}`)),
      })
    } catch (err) { reject(err) }
  })
}
