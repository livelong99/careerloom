// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { scripted } from './fixtures/scripted-llm'
import { decideProbe, MAX_PROBES, probeText } from './probe'
import type { InterviewPlan } from './types'

const plan = (over: Partial<InterviewPlan> = {}, strictness: 1 | 2 | 3 | 4 | 5 = 5): InterviewPlan => ({ mode: 'behavioural', minutes: 30, focusSkills: [], difficulty: 'adaptive', includeGenerated: true, persona: { style: 's', seniority: 'senior', strictness, name: 'A' }, voice: { engine: 'system', voiceId: 'x', speed: 1 }, echo: 'speakers', ...over })
const all = (o: Record<string, boolean>) => JSON.stringify({ result: true, metric: true, ownership: true, tradeoff: true, example: true, situation: true, action: true, task: true, ...o })
const llm = (o: Record<string, boolean>) => scripted([{ when: /checklist/i, reply: all(o) }])

describe('decideProbe', () => {
  it('probes the weakest element by priority (result before metric)', async () => {
    expect(await decideProbe('I did stuff', plan(), 0, llm({ metric: false, result: false }), () => 0)).toEqual({ probe: true, weakest: 'result' })
  })
  it('never probes more than twice per question', async () => {
    expect((await decideProbe('x', plan(), MAX_PROBES, llm({ metric: false }), () => 0)).probe).toBe(false)
  })
  it('does not probe a complete answer', async () => {
    expect(await decideProbe('x', plan(), 0, llm({}), () => 0)).toEqual({ probe: false, weakest: null })
  })
  it('strictness scales probe probability (1 → 0.2, 5 → 0.9)', async () => {
    const low = await decideProbe('x', plan({}, 1), 0, llm({ metric: false }), () => 0.5)
    const high = await decideProbe('x', plan({}, 5), 0, llm({ metric: false }), () => 0.5)
    expect([low.probe, high.probe]).toEqual([false, true])
  })
  it('technical modes skip STAR-only elements', async () => {
    expect(await decideProbe('x', plan({ mode: 'technical' }), 0, llm({ result: false, situation: false, tradeoff: false }), () => 0)).toEqual({ probe: true, weakest: 'tradeoff' })
  })
  it('a failing or garbled model means no probe, never a crash', async () => {
    expect((await decideProbe('x', plan(), 0, async () => { throw new Error('down') }, () => 0)).probe).toBe(false)
    expect((await decideProbe('x', plan(), 0, async () => 'not json', () => 0)).probe).toBe(false)
  })
  it('an empty answer is not probed and costs no call', async () => {
    const l = llm({ metric: false })
    expect((await decideProbe('  ', plan(), 0, l, () => 0)).probe).toBe(false)
    expect(l.calls).toHaveLength(0)
  })
  it('wording comes from the fixed template set', () => {
    expect(probeText('metric')).toMatch(/number/)
    expect(probeText('nonsense')).toBe(probeText('example'))
  })
})
