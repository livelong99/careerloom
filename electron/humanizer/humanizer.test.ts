import { describe, expect, it } from 'vitest'

import { CONDENSED_RULES, humanize, humanizePrompt, readFinal } from './index'
import { HUMANIZER_SKILL } from './skill'

describe('humanizer', () => {
  it('bundles the exact upstream v3.1.0 skill', () => {
    expect(HUMANIZER_SKILL).toContain('version: "3.1.0"')
    expect(HUMANIZER_SKILL).toContain('Embedded mode')
    expect(HUMANIZER_SKILL.length).toBeGreaterThan(30_000)
  })
  it('keeps the condensed rules short', () => {
    expect(CONDENSED_RULES.split('\n').length).toBeLessThanOrEqual(14)
  })
  it('builds an embedded-mode prompt with the text and an optional voice sample', () => {
    const p = humanizePrompt('Hello there.', 'my style')
    expect(p).toContain('Hello there.')
    expect(p).toContain('<sample>\nmy style')
    expect(humanizePrompt('x')).not.toContain('<sample>')
    // startAgentPrompt refuses a prompt that begins with "-": the skill file itself starts with "---"
    expect(humanizePrompt('x')).toMatch(/^[A-Za-z]/)
  })
  it('reads the last <final> block', () => {
    expect(readFinal('thinking <final>draft</final> then <final> done </final>')).toBe('done')
    expect(readFinal('no tags')).toBeNull()
  })
  it('returns the rewritten text, tokens and model', async () => {
    const r = await humanize('a', async () => ({ text: '<final>b</final>', tokens: 10, model: 'm' }))
    expect(r).toEqual({ text: 'b', tokens: 10, model: 'm' })
    await expect(humanize('a', async () => ({ text: 'oops', tokens: 1, model: 'm' }))).rejects.toThrow(/final/)
  })
})
