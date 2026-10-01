// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { createTtsService } from '../tts/service'

// The module map of plan §3.1 exists with its exact names; each owning package replaces the stub (and this file's row).
const MODULES = ['tts/adapter', 'tts/say', 'tts/kokoro', 'tts/kokoro-script', 'tts/install', 'tts/openrouter', 'tts/split', 'tts/service', 'copilot/echo-gate']

describe('module stubs (WP0)', () => {
  it.each(MODULES)('%s loads', async m => { await expect(import(`../${m}`)).resolves.toBeDefined() })
  it('stub functions throw a named owner, never return a fake value', () => {
    expect(() => createTtsService()).toThrow(/WP5/)
  })
})
