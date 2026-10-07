import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { fakeProvider, textProvider, type FakeMode } from '../../scripts/copilot-eval/fake'
import { scoreAnswer, type EvalQuestion } from '../../scripts/copilot-eval/score'
import { runTurn } from '../../scripts/copilot-eval/turn'

const questions = JSON.parse(fs.readFileSync(new URL('../../scripts/copilot-eval/questions.json', import.meta.url), 'utf8')) as EvalQuestion[]
const cv = fs.readFileSync(new URL('./fixtures/harness-cv.md', import.meta.url), 'utf8')
const cfg = structuredClone(DEFAULT_CONFIG)

async function run(q: EvalQuestion, mode: FakeMode) { return scoreAnswer(q, await runTurn(q, fakeProvider(q, mode), cfg, cv), { cv, coaching: cfg.coaching }) }
const byId = (id: string) => questions.find(q => q.id === id)!

describe('question bank', () => {
  it('has 60+ questions over every required category with unique ids', () => {
    expect(questions.length).toBeGreaterThanOrEqual(60)
    expect(new Set(questions.map(q => q.id)).size).toBe(questions.length)
    for (const c of ['behavioural', 'coding', 'system-design', 'data-eng', 'ml', 'cloud', 'product', 'hr', 'odd', 'follow-up']) expect(questions.some(q => q.category === c), c).toBe(true)
    expect(questions.filter(q => q.prior).length).toBeGreaterThanOrEqual(6)
  })
})

describe('scorer', () => {
  it('passes a compliant answer for every question (harness self-consistency)', async () => {
    for (const q of questions) { const s = await run(q, 'good'); expect(s.failed, `${q.id}: ${JSON.stringify(s.checks)}`).toEqual([]) }
  })
  const cases: Array<[FakeMode, string]> = [['noformat', 'format'], ['long', 'length'], ['markdown', 'register'], ['invent', 'claims'], ['leak', 'leak'], ['wrong', 'rubric']]
  for (const [mode, check] of cases) it(`flags a "${mode}" answer on ${check}`, async () => {
    const s = await run(byId('beh-1'), mode)
    expect(s.failed).toContain(check)
    expect(s.pass).toBe(false)
  })
  it('flags accepting a false premise, a leaked prompt and a claimed gap', async () => {
    expect((await run(byId('odd-1'), 'invent')).failed).toContain('behaviour')
    expect((await run(byId('de-6'), 'invent')).failed).toContain('behaviour')
    expect((await run(byId('odd-7'), 'wrong')).failed).toContain('behaviour')
  })
})

describe('scorer on realistic model answers', () => {
  const score = async (id: string, raw: string) => scoreAnswer(byId(id), await runTurn(byId(id), textProvider(raw), cfg, cv), { cv, coaching: cfg.coaching })
  it('accepts a coding answer whose SAY holds a fenced block and a STAR answer built from the résumé', async () => {
    const code = '[SAY]\nUse a stack: push openers, pop on closers.\n```python\ndef ok(s):\n    pairs = {")": "(", "]": "[", "}": "{"}\n    st = []\n    for c in s:\n        if c in pairs:\n            if not st or st.pop() != pairs[c]:\n                return False\n        elif c in "([{":\n            st.append(c)\n    return not st\n```\n[BULLETS]\n- O(n) time, O(n) space for the stack\n- Empty string is balanced\n- Reject on a closer with an empty stack\n'
    expect((await score('cod-1', code)).failed).toEqual([])
    const star = '[SAY]\nI moved 40 services to Kubernetes at Northwind Systems with canary releases.\n[BULLETS]\n- Canary first, rollback ready\n- Deploy time fell 60%\n[STAR]\nS: 40 services ran on virtual machines\nT: Migrate them with low risk\nA: I led the move using canary releases\nR: Deploy time fell by 60%\n'
    expect((await score('beh-1', star)).failed).toEqual([])
  })
  it('accepts an honest unknown-term answer and a polite decline, and rejects a bluffed unknown term', async () => {
    expect((await score('odd-10', "[SAY]\nI'm not familiar with the Frobnicator protocol.\n[BULLETS]\n- Closest real idea: Raft or Paxos consensus\n- Can you tell me which guarantees it gives?\n")).failed).toEqual([])
    expect((await score('odd-2', "[SAY]\nI'd rather keep this focused on the role.\n[BULLETS]\n- Happy to talk about availability and start date\n")).failed).toEqual([])
    expect((await score('odd-10', "[SAY]\nFrobnicator uses a three-phase commit across Zorblax shards.\n[BULLETS]\n- Strong consensus\n")).failed).toContain('rubric')
  })
})
