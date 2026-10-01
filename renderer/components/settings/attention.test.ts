// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { attentionFor } from './attention'
import type { Readiness } from '../../lib/types'

const cli = (ready: boolean) => ({ id: 'claude' as const, label: 'Claude', path: null, version: null, signedIn: null, skill: false, configured: false, ready, problems: [] })
const readiness = (ready: boolean): Readiness => ({ root: '/r', checkedAt: 0, deps: true, clis: [cli(ready)] })

describe('attentionFor', () => {
  it('flags runners when no CLI is ready', () => {
    expect(attentionFor({ runner: 'claude', hasApiKey: false, hasOpencodeKey: false }, readiness(false)).runners).toBeTruthy()
    expect(attentionFor({ runner: 'claude', hasApiKey: false, hasOpencodeKey: false }, readiness(true))).toEqual({})
  })
  it('flags a missing key for the key-based runners only', () => {
    expect(attentionFor({ runner: 'api', hasApiKey: false, hasOpencodeKey: false }, null).keys).toMatch(/OpenRouter/)
    expect(attentionFor({ runner: 'zen', hasApiKey: true, hasOpencodeKey: false }, null).keys).toMatch(/Zen/)
    expect(attentionFor({ runner: 'api', hasApiKey: true, hasOpencodeKey: false }, null)).toEqual({})
  })
})
