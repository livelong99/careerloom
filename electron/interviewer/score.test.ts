// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { GOLDEN_POOL } from './fixtures/golden-kb'
import { scripted } from './fixtures/scripted-llm'
import { nextStats, parseCriteria, scoreAnswer } from './score'

const item = GOLDEN_POOL[0]!
const ANSWER = 'I led the migration and cut deploy time by 40 percent.'
const reply = JSON.stringify({ criteria: [
  { criterion: 'Clear ownership', score: 5, evidence: 'I led the migration' }, { criterion: 'Concrete result', score: 4, evidence: 'cut deploy time by 40 percent' },
  { criterion: 'Trade-offs', score: 2, evidence: 'invented quote not in the answer' }, { criterion: 'Structure', score: 9, evidence: '' },
] })

describe('scoreAnswer', () => {
  it('scores the rubric rows with evidence quotes and a mean', async () => {
    const r = await scoreAnswer(item, ANSWER, scripted([{ when: /score one spoken/i, reply }]))
    expect(r.criteria.map(c => c.score)).toEqual([5, 4, 2, 5]) // 9 clamped to 5
    expect(r.criteria[0]!.evidence).toBe('I led the migration')
    expect(r.criteria[2]!.evidence).toBe('') // not a verbatim part of the answer
    expect(r.score).toBe(4)
    expect(r.skipped).toBe(false)
  })
  it('the call sees the question, rubric and answer only (no cv, no persona name)', async () => {
    const llm = scripted([{ when: /score one spoken/i, reply }])
    await scoreAnswer(item, ANSWER, llm)
    const sent = `${llm.calls[0]!.system}\n${llm.calls[0]!.user}`
    expect(sent).toMatch(item.text); expect(sent).toMatch(/Clear ownership/); expect(sent).toMatch(ANSWER)
    expect(sent).not.toMatch(/cv\.md|résumé|resume/i)
  })
  it('an empty answer is skipped with no model call', async () => {
    const llm = scripted([])
    expect(await scoreAnswer(item, '  ', llm)).toEqual({ itemId: item.id, score: null, criteria: [], hintUsed: false, skipped: true })
    expect(llm.calls).toHaveLength(0)
  })
  it('model failure or garbage yields an unscored result, never a throw', async () => {
    expect((await scoreAnswer(item, ANSWER, async () => { throw new Error('x') })).score).toBeNull()
    expect((await scoreAnswer(item, ANSWER, async () => 'nope')).criteria).toEqual([])
  })
  it('records hint use', async () => {
    expect((await scoreAnswer(item, ANSWER, scripted([{ when: /./, reply }]), true)).hintUsed).toBe(true)
  })
  it('parseCriteria drops malformed rows', () => {
    expect(parseCriteria(JSON.stringify({ criteria: [{ criterion: '', score: 3 }, { criterion: 'x', score: 'a' }, null] }), 'a')).toBeNull()
  })
})

describe('nextStats', () => {
  it('first score seeds the average; later scores use an EMA of 0.5', () => {
    const a = nextStats({ asked: 0, lastScore: null, avgScore: null }, 4)
    expect(a).toEqual({ asked: 1, lastScore: 4, avgScore: 4 })
    expect(nextStats(a, 2)).toEqual({ asked: 2, lastScore: 2, avgScore: 3 })
  })
  it('an unscored ask only counts', () => {
    expect(nextStats({ asked: 1, lastScore: 3, avgScore: 3 }, null)).toEqual({ asked: 2, lastScore: 3, avgScore: 3 })
  })
})
