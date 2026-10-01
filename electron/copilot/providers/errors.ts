// Provider errors -> something a person can act on (plan §3.4 error states). Pure; used by the Test button and the live engine.
import type { ErrorAction } from '../types'
import { LlmError } from './openrouter'

export const PRIVACY_SETTINGS_URL = 'https://openrouter.ai/settings/privacy'
export type FriendlyError = { message: string; code: string | null; actions: ErrorAction[]; suggestion?: string }

export function friendlyLlmError(e: unknown, ctx: { dataCollection: 'deny' | 'allow' }): FriendlyError {
  if (!(e instanceof LlmError)) return { message: 'Could not reach the model', code: null, actions: [] }
  const pick = (message: string, actions: ErrorAction[]): FriendlyError => ({ message, code: e.code, actions, ...(e.suggestion ? { suggestion: e.suggestion } : {}) })
  switch (e.code) {
    case 'policy':
      return ctx.dataCollection === 'deny'
        ? pick('This model may use your prompts (free models can train on them), which your privacy setting blocks. Pick a paid model, or allow free models.', ['change-model', 'privacy-settings'])
        : pick("OpenRouter's account privacy settings still block this model. Allow free/training endpoints there, or pick a paid model.", ['privacy-settings', 'change-model'])
    case 'no_key': return pick('Add your OpenRouter key first.', ['manage-key'])
    case 'auth': return pick('OpenRouter rejected the key. Check it or paste a new one.', ['manage-key'])
    case 'credits': return pick('Your OpenRouter account is out of credits. Add credits or use another key.', ['manage-key'])
    case 'rate_limit': return pick('This model is rate-limited right now. Try again in a moment or choose another model.', ['change-model'])
    case 'model_unavailable': return pick('OpenRouter has no provider for this model right now. Choose another model.', ['change-model'])
    case 'timeout': return pick('The model took too long to respond.', [])
    case 'server': return pick('OpenRouter or the model provider had a problem. Try again.', [])
    case 'budget': return pick(e.message, [])
    default: return pick(e.message, [])
  }
}
