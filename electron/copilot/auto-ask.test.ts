import { describe, expect, it } from 'vitest'

import { createAutoAsk } from './auto-ask'
import { DEFAULT_CONFIG } from './config'
import type { DetectedQuestion, TranscriptLine } from './types'

const eng = DEFAULT_CONFIG.engine
const line = (speaker: TranscriptLine['speaker'] = 'interviewer'): TranscriptLine => ({ id: 'l', speaker, text: 't', final: true, t0: 0, t1: 1 })
const q = (text: string, over: Partial<DetectedQuestion> = {}): DetectedQuestion => ({ id: 'q', text, type: 'behavioural', confidence: 0.9, at: 0, auto: true, ...over })
const SYS: Array<'mic' | 'system'> = ['mic', 'system']

describe('auto-ask decision', () => {
  it('asks for a complete interviewer question on the system channel', () => {
    const a = createAutoAsk({ now: () => 0 })
    const d = a.decide(q('Tell me about yourself.'), line(), SYS, eng)
    expect(d).toMatchObject({ ask: true })
  })
  it('only the interviewer channel triggers: mic-only (both voices) and candidate lines never auto-ask', () => {
    const a = createAutoAsk({ now: () => 0 })
    expect(a.decide(q('Tell me about yourself.'), line(), ['mic'], eng)).toEqual({ ask: false, reason: 'speaker' })
    expect(a.decide(q('Tell me about yourself.'), line('you'), SYS, eng)).toEqual({ ask: false, reason: 'speaker' })
  })
  it('waits for a finished thought and skips small talk', () => {
    const a = createAutoAsk({ now: () => 0 })
    expect(a.decide(q('why do you want to', { hint: { kind: 'behavioural', complete: false, needsScreenshot: false, deep: false, source: 'jev' } }), line(), SYS, eng)).toEqual({ ask: false, reason: 'incomplete' })
    expect(a.decide(q('How are you doing today?'), line(), SYS, eng)).toEqual({ ask: false, reason: 'small-talk' })
  })
  it('rate limits false-positive storms: 2.5 s gap and 6 per minute', () => {
    let t = 0
    const a = createAutoAsk({ now: () => t })
    expect(a.decide(q('Tell me about yourself.'), line(), SYS, eng).ask).toBe(true)
    t = 1000
    expect(a.decide(q('Why do you want to work here?'), line(), SYS, eng)).toEqual({ ask: false, reason: 'rate' })
    let asked = 1
    for (let i = 0; i < 19; i++) { t += 3000; if (a.decide(q(`Question number ${i}?`), line(), SYS, eng).ask) asked++ }
    expect(asked).toBe(6) // 19 attempts inside one minute: capped
    t += 61_000
    expect(a.decide(q('Tell me about yourself.'), line(), SYS, eng).ask).toBe(true) // window slides
  })
})
