// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPracticeRunner, GENERIC_QUESTIONS, parseFollowUp, questionsFromReport } from './practice'
import { parseReport } from '../job-view/reportParse'
import type { DetectedQuestion, PracticeQuestion, TranscriptLine } from './types'

const REPORT = `# Evaluation: Northwind Labs — Senior Platform Engineer

## A) Role Summary

| Field | Value |
|---|---|
| Archetype | Platform |

## B) CV Match

| Requirement | Match | Evidence |
|---|---|---|
| Kubernetes | strong | ran clusters |

### Gaps

1. Terraform:
   - Risk: medium
   - Mitigation: used Pulumi

## F) Interview Plan

### STAR+R Stories

| # | Requirement | Story | S | T | A | R | Reflection |
|---|---|---|---|---|---|---|---|
| 1 | Kubernetes | Cluster migration | s | t | a | r | x |
| 2 | Incident response | Pager storm | s | t | a | r | x |

### Likely Red-Flag Questions & Answers

**Q: Why are you leaving your current role?** A: Growth.

**Q: Explain the gap in 2021.** A: Study.
`

describe('questionsFromReport', () => {
  it('builds story, red-flag and gap questions from the interview plan', () => {
    const qs = questionsFromReport(parseReport(REPORT), [], {})
    const texts = qs.map(q => q.text)
    expect(texts.some(t => /Kubernetes/.test(t))).toBe(true)
    expect(texts.some(t => /Incident response/.test(t))).toBe(true)
    expect(texts).toContain('Why are you leaving your current role?')
    expect(texts).toContain('Explain the gap in 2021.')
    expect(texts.some(t => /Terraform/.test(t))).toBe(true)
    expect(qs.every(q => q.source === 'report')).toBe(true)
  })
  it('falls back to generic questions when there is no report, and never returns an empty queue', () => {
    const qs = questionsFromReport(null, [], {})
    expect(qs.length).toBe(GENERIC_QUESTIONS.length)
    expect(qs.every(q => q.source === 'custom')).toBe(true)
  })
  it('appends custom questions, dedupes, and keeps ids stable across calls', () => {
    const a = questionsFromReport(parseReport(REPORT), ['What would you do in month one?', 'Why are you leaving your current role?'], {})
    const b = questionsFromReport(parseReport(REPORT), ['What would you do in month one?'], {})
    expect(a.filter(q => q.text === 'Why are you leaving your current role?')).toHaveLength(1)
    expect(a.find(q => q.text.startsWith('What would you do'))?.source).toBe('custom')
    expect(a.find(q => q.text.startsWith('What would you do'))?.id).toBe(b.find(q => q.text.startsWith('What would you do'))?.id)
  })
  it('fills lastScore from the score map by question id', () => {
    const base = questionsFromReport(parseReport(REPORT), [], {})
    const id = base[0]!.id
    expect(questionsFromReport(parseReport(REPORT), [], { [id]: 4.2 })[0]!.lastScore).toBe(4.2)
  })
})

describe('parseFollowUp', () => {
  it('returns a trimmed question, or null for NONE / empty / runaway text', () => {
    expect(parseFollowUp('  "What was the hardest trade-off?"  ')).toBe('What was the hardest trade-off?')
    expect(parseFollowUp('NONE')).toBeNull()
    expect(parseFollowUp('none.')).toBeNull()
    expect(parseFollowUp('')).toBeNull()
    expect(parseFollowUp('x'.repeat(400))).toBeNull()
  })
})

describe('practice runner on fake STT + fake provider', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const qs: PracticeQuestion[] = [
    { id: 'q1', text: 'Tell me about a migration.', type: 'behavioural', source: 'report', lastScore: null },
    { id: 'q2', text: 'Why leave?', type: 'behavioural', source: 'report', lastScore: null },
  ]
  const you = (id: string, text: string): TranscriptLine => ({ id, speaker: 'you', text, final: true, t0: 0, t1: 1 })
  function harness(over: Partial<Parameters<typeof createPracticeRunner>[0]> = {}) {
    const asked: DetectedQuestion[] = []; const lines: TranscriptLine[] = []; let done = 0
    const run = createPracticeRunner({
      questions: qs, followups: false, answerMs: 120_000, now: () => 1000,
      sink: { question: q => asked.push(q), line: l => lines.push(l), done: () => { done++ } },
      ...over,
    })
    return { run, asked, lines, done: () => done }
  }

  it('asks the first question on start and records it as an interviewer line', () => {
    const h = harness(); h.run.start()
    expect(h.asked.map(q => q.id)).toEqual(['q1'])
    expect(h.asked[0]).toMatchObject({ type: 'behavioural', auto: false })
    expect(h.lines[0]).toMatchObject({ speaker: 'interviewer', text: 'Tell me about a migration.' })
  })
  it('moves to the next question when the answer turn ends, then finishes', async () => {
    const h = harness(); h.run.start()
    await h.run.feed(you('a1', 'We moved 40 services.'), true)
    expect(h.asked.map(q => q.id)).toEqual(['q1', 'q2'])
    await h.run.feed(you('a2', 'Growth.'), true)
    expect(h.done()).toBe(1)
    expect(h.lines.filter(l => l.speaker === 'you')).toHaveLength(2)
  })
  it('ignores partial turns and interviewer-channel text', async () => {
    const h = harness(); h.run.start()
    await h.run.feed(you('a1', 'um'), false)
    expect(h.asked).toHaveLength(1)
  })
  it('asks one engine-generated follow-up per question when enabled, then moves on', async () => {
    const complete = vi.fn().mockResolvedValueOnce('What was the hardest trade-off?').mockResolvedValue('NONE')
    const h = harness({ followups: true, complete })
    h.run.start()
    await h.run.feed(you('a1', 'We moved services.'), true)
    expect(h.asked.map(q => q.text)).toEqual(['Tell me about a migration.', 'What was the hardest trade-off?'])
    await h.run.feed(you('a2', 'Latency vs cost.'), true)
    expect(h.asked.map(q => q.id).pop()).toBe('q2')
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it('a failing follow-up generator never blocks the queue', async () => {
    const h = harness({ followups: true, complete: () => Promise.reject(new Error('offline')) })
    h.run.start()
    await h.run.feed(you('a1', 'Answer.'), true)
    expect(h.asked.map(q => q.id)).toEqual(['q1', 'q2'])
  })
  it('advances after the answer time limit with no turn end', async () => {
    const h = harness({ answerMs: 60_000 }); h.run.start()
    await vi.advanceTimersByTimeAsync(60_001)
    expect(h.asked.map(q => q.id)).toEqual(['q1', 'q2'])
  })
  it('stop cancels timers and further input is ignored', async () => {
    const h = harness({ answerMs: 60_000 }); h.run.start(); h.run.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    await h.run.feed(you('a1', 'late'), true)
    expect(h.asked).toHaveLength(1)
    expect(h.done()).toBe(0)
  })
})
