// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createBudget } from './research/budget'
import { createBraveBackend } from './research/search/brave'
import { retrieve } from './retrieve'
import { createTtsService } from '../tts/service'

// The module map of plan §3.1 exists with its exact names; each owning package replaces the stub (and this file's row).
const MODULES = ['kb/store', 'kb/bm25', 'kb/retrieve', 'kb/hash', 'kb/sources', 'kb/research/plan', 'kb/research/fetch', 'kb/research/robots', 'kb/research/extract', 'kb/research/guard', 'kb/research/dedupe', 'kb/research/classify', 'kb/research/generate', 'kb/research/budget', 'kb/research/pipeline',
  'kb/research/search/adapter', 'kb/research/search/brave', 'kb/research/search/exa', 'kb/research/search/serper', 'kb/research/search/searxng', 'kb/research/search/fake',
  'tts/adapter', 'tts/say', 'tts/kokoro', 'tts/kokoro-script', 'tts/install', 'tts/openrouter', 'tts/split', 'tts/service', 'copilot/echo-gate']

describe('module stubs (WP0)', () => {
  it.each(MODULES)('%s loads', async m => { await expect(import(`../${m}`)).resolves.toBeDefined() })
  it('stub functions throw a named owner, never return a fake value', () => {
    expect(() => retrieve('j', 'q')).toThrow(/WP1/)
    expect(() => createBudget({ usd: 1, minutes: 1 })).toThrow(/WP2/)
    expect(() => createBraveBackend({})).toThrow(/WP2/)
    expect(() => createTtsService()).toThrow(/WP5/)
  })
})
