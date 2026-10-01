import { describe, expect, it } from 'vitest'

import { createHeuristicGate, heuristicHint } from './heuristic'

const gate = createHeuristicGate()
const ask = (text: string, speaker: 'interviewer' | 'you' = 'interviewer') => gate.decide({ text, speaker })

describe('heuristic gate (zero latency, local)', () => {
  it('says yes to clear questions and imperatives from the interviewer', async () => {
    for (const t of ['Tell me about yourself.', 'why do you want to work here', 'Walk me through your last project', 'Can you explain how an index works?']) {
      const v = await ask(t)
      expect(v.isQuestion, t).toBe(true)
      expect(v.source).toBe('heuristic')
    }
  })
  it('says no to chatter and to anything the candidate says', async () => {
    for (const t of ['okay great', 'can you hear me', 'thanks for joining today']) expect((await ask(t)).isQuestion, t).toBe(false)
    expect((await ask('Tell me about yourself.', 'you')).isQuestion).toBe(false)
  })
  it('is unsure about ambiguous wh-lines so a model may be asked', async () => {
    expect((await ask('in your last job what was the hardest bug to track down')).isQuestion).toBeNull()
  })
  it('reports completeness, kind, screenshot need and depth', async () => {
    expect(heuristicHint('Design a URL shortener.')).toMatchObject({ kind: 'system-design', deep: true, complete: true, needsScreenshot: false, source: 'heuristic' })
    expect(heuristicHint('Write a function that reverses a linked list.')).toMatchObject({ kind: 'coding', deep: true })
    expect(heuristicHint('Tell me about a time you disagreed with your manager')).toMatchObject({ kind: 'behavioural', deep: false })
    expect(heuristicHint('What is the difference between TCP and UDP?')).toMatchObject({ kind: 'factual' })
    expect(heuristicHint('How are you today?')).toMatchObject({ kind: 'small-talk' })
    expect(heuristicHint('Can you look at the code on my screen and tell me what is wrong?').needsScreenshot).toBe(true)
    expect(heuristicHint('why do you want to work').complete).toBe(false) // cut off, no end mark, short
  })
})
