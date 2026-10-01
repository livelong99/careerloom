import { describe, expect, it } from 'vitest'
import { friendlyLlmError } from './errors'
import { LlmError } from './openrouter'

const POLICY_MSG = 'No endpoints found matching your data policy (Free model training). Configure: https://openrouter.ai/settings/privacy'

describe('friendlyLlmError', () => {
  it('policy mismatch under deny: explains training, offers Change model + privacy settings', () => {
    const f = friendlyLlmError(new LlmError('policy', POLICY_MSG), { dataCollection: 'deny' })
    expect(f.message).toMatch(/may use your prompts|train/i)
    expect(f.message).not.toMatch(/Configure:/)
    expect(f.actions).toEqual(['change-model', 'privacy-settings'])
  })
  it('policy mismatch with collection already allowed points at the account-level setting', () => {
    const f = friendlyLlmError(new LlmError('policy', POLICY_MSG), { dataCollection: 'allow' })
    expect(f.message).toMatch(/account/i)
    expect(f.actions).toEqual(['privacy-settings', 'change-model'])
  })
  it.each([
    ['no_key', ['manage-key']], ['auth', ['manage-key']], ['credits', ['manage-key']],
    ['rate_limit', ['change-model']], ['model_unavailable', ['change-model']],
    ['timeout', []], ['server', []], ['budget', []],
  ] as const)('%s -> %j', (code, actions) => {
    const f = friendlyLlmError(new LlmError(code, 'raw provider text'), { dataCollection: 'deny' })
    expect(f.actions).toEqual(actions)
    expect(f.message.length).toBeGreaterThan(10)
  })
  it('carries the engine suggestion and tolerates non-LlmError values', () => {
    const e = new LlmError('policy', POLICY_MSG); e.suggestion = 'openai/gpt-4.1-nano'
    expect(friendlyLlmError(e, { dataCollection: 'deny' }).suggestion).toBe('openai/gpt-4.1-nano')
    expect(friendlyLlmError(new Error('x'), { dataCollection: 'deny' })).toMatchObject({ actions: [] })
  })
})
