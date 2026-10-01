import { describe, expect, it } from 'vitest'

import { sampleSuggestion } from './CoachingPreview'

const base = { shape: 'cues+star' as const, length: 2 as const, tone: 'direct' as const, persona: '', quoteResume: true }

describe('sampleSuggestion', () => {
  it('cues: bullets only; cues+star adds STAR; script adds full text', () => {
    expect(sampleSuggestion({ ...base, shape: 'cues' })).toMatchObject({ star: null, script: null })
    expect(sampleSuggestion(base).star).not.toBeNull()
    expect(sampleSuggestion({ ...base, shape: 'script' }).script).toBeTruthy()
  })
  it('length sets the number of bullets', () => {
    expect(sampleSuggestion({ ...base, length: 1 }).bullets).toHaveLength(1)
    expect(sampleSuggestion({ ...base, length: 3 }).bullets).toHaveLength(3)
  })
  it('tone changes the say-first line; quoteResume toggles the proof line', () => {
    const lines = (['direct', 'warm', 'formal'] as const).map(tone => sampleSuggestion({ ...base, tone }).say)
    expect(new Set(lines).size).toBe(3)
    expect(sampleSuggestion(base).proof).not.toBeNull()
    expect(sampleSuggestion({ ...base, quoteResume: false }).proof).toBeNull()
  })
})
