import { describe, expect, it } from 'vitest'

import { parseAgyModels, parseClaudeAuth, parseCodexLogin, pickReadyRunner } from './readiness'
import type { Readiness } from './contract'

describe('sign-in parsers', () => {
  it('reads claude auth status JSON', () => {
    expect(parseClaudeAuth('{"loggedIn": true, "authMethod": "claude.ai"}')).toBe(true)
    expect(parseClaudeAuth('{"loggedIn": false}')).toBe(false)
    expect(parseClaudeAuth('garbage')).toBeNull()
  })
  it('reads codex login status', () => {
    expect(parseCodexLogin('Logged in using ChatGPT')).toBe(true)
    expect(parseCodexLogin('Not logged in')).toBe(false)
  })
  it('reads agy models', () => {
    expect(parseAgyModels('Fetching available models...\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\n')).toBe(true)
    expect(parseAgyModels('You are currently not signed in.')).toBe(false)
  })
})

const r = (ready: Record<string, boolean>): Readiness => ({
  root: '/w', checkedAt: 0, deps: true,
  clis: (['claude', 'codex', 'antigravity'] as const).map(id => ({ id, label: id, path: null, version: null, signedIn: true, skill: true, configured: true, ready: ready[id] ?? false, problems: [] })),
})

describe('pickReadyRunner', () => {
  it('keeps a ready runner and the API runner', () => {
    expect(pickReadyRunner('codex', r({ codex: true, claude: true }))).toBeNull()
    expect(pickReadyRunner('api', r({}))).toBeNull()
  })
  it('switches to the first ready CLI when the current one is not ready', () => {
    expect(pickReadyRunner('antigravity', r({ codex: true }))).toBe('codex')
    expect(pickReadyRunner('claude', r({}))).toBeNull()
  })
})
