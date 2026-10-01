import { describe, expect, it } from 'vitest'
import fixture from './fixtures/detector-utterances.json'
import heldout from './fixtures/detector-heldout.json'
import { classifyByRules, createDetector, parseClassification, questionType } from './detector'
import type { TranscriptLine } from './types'

type Item = { text: string; label: 'q' | 'n'; type?: string }
const items = fixture.items as Item[]
const line = (text: string, over: Partial<TranscriptLine> = {}): TranscriptLine => ({ id: 'l', speaker: 'interviewer', text, final: true, t0: 0, t1: 1, ...over })

describe('detector fixture', () => {
  it('has at least 60 labelled utterances with both classes', () => {
    expect(items.length).toBeGreaterThanOrEqual(60)
    expect(items.filter(i => i.label === 'q').length).toBeGreaterThan(25)
    expect(items.filter(i => i.label === 'n').length).toBeGreaterThan(20)
  })
  it('rules alone reach precision >= 0.9 and recall >= 0.85 (no LLM, ambiguous = not a question)', async () => {
    const d = createDetector({ now: () => 0 })
    let tp = 0, fp = 0, fn = 0
    const misses: string[] = []
    for (const it of items) {
      const got = await d.feed(line(it.text)); d.reset()
      if (got && it.label === 'q') tp++
      else if (got) { fp++; misses.push(`FP: ${it.text}`) }
      else if (it.label === 'q') { fn++; misses.push(`FN: ${it.text}`) }
    }
    const precision = tp / (tp + fp), recall = tp / (tp + fn)
    console.log(`detector P=${precision.toFixed(3)} R=${recall.toFixed(3)} (tp ${tp}, fp ${fp}, fn ${fn})`, misses)
    expect(precision).toBeGreaterThanOrEqual(0.9)
    expect(recall).toBeGreaterThanOrEqual(0.85)
  })
  it('holds up on the held-out set (rules-only; first run before the conditional/comma-clause rules: P 0.91, R 0.67)', async () => {
    let tp = 0, fp = 0, fn = 0
    for (const it of heldout.items as Item[]) {
      const got = await createDetector().feed(line(it.text))
      if (got && it.label === 'q') tp++; else if (got) fp++; else if (it.label === 'q') fn++
    }
    console.log(`held-out P=${(tp / (tp + fp)).toFixed(3)} R=${(tp / (tp + fn)).toFixed(3)}`)
    expect(tp / (tp + fp)).toBeGreaterThanOrEqual(0.9)
    expect(tp / (tp + fn)).toBeGreaterThanOrEqual(0.85)
  })
  it('labels question types correctly on most positives', async () => {
    const pos = items.filter(i => i.label === 'q')
    const right = pos.filter(i => questionType(i.text) === i.type).length
    console.log(`type accuracy ${(right / pos.length).toFixed(3)}`)
    expect(right / pos.length).toBeGreaterThanOrEqual(0.75)
  })
})

describe('createDetector', () => {
  it('ignores the candidate channel and partial lines', async () => {
    const d = createDetector()
    expect(await d.feed(line('Tell me about yourself.', { speaker: 'you' }))).toBeNull()
    expect(await d.feed(line('Tell me about yourself.', { final: false }))).toBeNull()
  })
  it('emits a typed question with an increasing id', async () => {
    const d = createDetector({ now: () => 5 })
    expect(await d.feed(line('Design a URL shortener.'))).toMatchObject({ id: 'q1', type: 'system-design', auto: true, at: 5, text: 'Design a URL shortener.' })
    expect(await d.feed(line('Write a function that reverses a linked list.'))).toMatchObject({ id: 'q2', type: 'coding' })
  })
  it('drops an STT re-emit of the same final inside the window, but not after it', async () => {
    let t = 0
    const d = createDetector({ now: () => t })
    expect(await d.feed(line('Why do you want to work here?'))).not.toBeNull()
    t = 3000
    expect(await d.feed(line('why do you want to work here'))).toBeNull()
    t = 20_000
    expect(await d.feed(line('why do you want to work here'))).not.toBeNull()
  })
  it('calls the classifier only for ambiguous lines, and uses its verdict', async () => {
    const calls: string[] = []
    const classify = async (t: string) => { calls.push(t); return { isQuestion: true, type: 'technical' as const } }
    const d = createDetector({ classify })
    expect(await d.feed(line('Tell me about yourself.'))).not.toBeNull()
    expect(await d.feed(line('Perfect, thank you.'))).toBeNull()
    expect(calls).toEqual([])
    const amb = 'I was wondering about how you handle retries'
    expect(classifyByRules(amb).verdict).toBe('ambiguous')
    expect(await d.feed(line(amb))).toMatchObject({ type: 'technical' })
    expect(calls).toEqual([amb])
  })
  it('treats a classifier rejection, null or crash as not-a-question', async () => {
    const amb = 'I was wondering about how you handle retries'
    expect(await createDetector({ classify: async () => ({ isQuestion: false, type: 'other' }) }).feed(line(amb))).toBeNull()
    expect(await createDetector({ classify: async () => null }).feed(line(amb))).toBeNull()
    expect(await createDetector({ classify: async () => { throw new Error('offline') } }).feed(line(amb))).toBeNull()
    expect(await createDetector().feed(line(amb))).toBeNull()
  })
  it('reset clears ids and the dedupe memory', async () => {
    const d = createDetector({ now: () => 0 })
    await d.feed(line('Design a URL shortener.')); d.reset()
    expect(await d.feed(line('Design a URL shortener.'))).toMatchObject({ id: 'q1' })
  })
})

describe('parseClassification', () => {
  it.each([['no', false, 'other'], ['No.', false, 'other'], ['behavioural', true, 'behavioural'], ['Behavioral\n', true, 'behavioural'], ['system-design', true, 'system-design'], ['coding', true, 'coding']])('%j', (reply, isQuestion, type) => {
    expect(parseClassification(reply)).toEqual({ isQuestion, type })
  })
  it('returns null for unparseable replies', () => {
    expect(parseClassification('')).toBeNull()
    expect(parseClassification('I think it is')).toBeNull()
  })
})
