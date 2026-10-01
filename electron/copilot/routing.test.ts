import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { heuristicHint, questionType } from './detector'
import { routeQuestion } from './routing'
import type { DetectedQuestion, QuestionHint } from './types'

const eng = DEFAULT_CONFIG.engine
const q = (text: string, over: Partial<DetectedQuestion> = {}): DetectedQuestion => ({ id: 'q1', text, type: questionType(text), confidence: 0.9, at: 0, auto: true, ...over })

describe('routing', () => {
  it('escalates coding and design to Deep only when escalation is on; behavioural stays on the chosen tier', () => {
    expect(routeQuestion(q('Design a URL shortener.'), eng).tier).toBe('deep')
    expect(routeQuestion(q('Design a URL shortener.'), { ...eng, escalateForDesignCoding: false }).tier).toBe('fast')
    expect(routeQuestion(q('Tell me about a time you disagreed with your manager'), { ...eng, tier: 'balanced' }).tier).toBe('balanced')
  })
  it('follow-ups and clarifications never escalate', () => {
    expect(routeQuestion(q('Design a URL shortener.'), eng, 'followup').tier).toBe('fast')
  })
  it('trusts a model hint over the rules, including depth', () => {
    const hint: QuestionHint = { kind: 'factual', complete: true, needsScreenshot: false, deep: true, source: 'jev' }
    expect(routeQuestion(q('what about the thing', { hint }), eng).tier).toBe('deep')
  })
  it('small talk: cheapest tier, tiny budget, skipped when auto-asked, answered when the user pressed the key', () => {
    const r = routeQuestion(q('Good afternoon, how are you doing today?'), { ...eng, tier: 'deep' })
    expect(r).toMatchObject({ kind: 'small-talk', tier: 'fast', variant: 'brief', skipLlm: true })
    expect(r.maxTokensScale).toBeLessThan(0.5)
    expect(routeQuestion(q('Good afternoon, how are you doing today?', { auto: false }), eng).skipLlm).toBe(false)
  })
  it('flags turns that need a screenshot', () => {
    expect(routeQuestion(q('Can you look at the code on my screen and tell me what is wrong?'), eng).needsScreenshot).toBe(true)
    expect(routeQuestion(q('Tell me about yourself.'), eng).needsScreenshot).toBe(false)
  })
})

// Labelled fixtures: the WP2 detector set (kind labels of real questions) plus small-talk and screenshot lists.
type Item = { text: string; label: 'q' | 'n'; type?: string }
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/detector-utterances.json'), 'utf8')).items as Item[]
const EXPECT: Record<string, QuestionHint['kind']> = { behavioural: 'behavioural', technical: 'factual', 'system-design': 'system-design', coding: 'coding', other: 'factual' }
const SMALL = ['Good afternoon, how are you doing today?', 'Hi, how are you?', 'Can you hear me okay?', 'Thanks for joining us today.', 'Nice to meet you.', 'How was your weekend?', 'Can you see my screen?', 'Thank you for coming in.']
const NOT_SMALL = fixture.filter(i => i.label === 'q').map(i => i.text)
const SCREEN = ['Look at this code and tell me what is wrong.', 'Can you read the diagram on my screen?', 'What is the bug in the snippet below?', 'On the screen you can see a query, how would you optimise it?']
const NO_SCREEN = ['Tell me about yourself.', 'Explain the difference between TCP and UDP.', 'Why do you want to work here?', 'Design a rate limiter.']

// Fresh phrasings written after the rules were frozen (the detector fixture above was used to tune them, so its numbers are in-sample).
const FRESH: Array<[string, QuestionHint['kind']]> = [
  ['Implement an LRU cache with O(1) get and put.', 'coding'], ['Given a string, find the longest substring without repeating characters.', 'coding'], ['Can you write a query that returns the second highest salary?', 'coding'], ['How would you reverse a binary tree in place?', 'coding'],
  ['How would you design a chat application like WhatsApp?', 'system-design'], ['Architect a system that ingests a million events per second.', 'system-design'], ['Where would you add caching if this service became slow under load?', 'system-design'], ['How would you shard a user table with billions of rows?', 'system-design'],
  ['Tell me about a time a project you owned went off the rails.', 'behavioural'], ['Describe a situation where you had to influence without authority.', 'behavioural'], ['What is your biggest weakness?', 'behavioural'], ['Why are you leaving your current job?', 'behavioural'], ['Give me an example of feedback you disagreed with.', 'behavioural'],
  ['What is the difference between a mutex and a semaphore?', 'factual'], ['Explain how HTTPS works.', 'factual'], ['What does the volatile keyword do in Java?', 'factual'], ['How does a B-tree index differ from a hash index?', 'factual'], ['What is eventual consistency?', 'factual'],
]

function pr(pairs: Array<[expected: string, got: string]>, label: string) {
  const tp = pairs.filter(([e, g]) => e === label && g === label).length
  const fp = pairs.filter(([e, g]) => e !== label && g === label).length
  const fn = pairs.filter(([e, g]) => e === label && g !== label).length
  return { precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1, n: tp + fn }
}

describe('routing label quality on the fixtures', () => {
  const pairs = fixture.filter(i => i.label === 'q' && i.type).map((i): [string, string] => [EXPECT[i.type!]!, routeQuestion(q(i.text), eng).kind])
  it('kind precision/recall per label', () => {
    const report = Object.fromEntries((['coding', 'system-design', 'behavioural', 'factual'] as const).map(k => [k, pr(pairs, k)]))
    console.info('routing P/R (detector fixture, n=' + pairs.length + '):', JSON.stringify(report))
    for (const [k, v] of Object.entries(report)) { expect(v.precision, `${k} precision`).toBeGreaterThanOrEqual(0.7); expect(v.recall, `${k} recall`).toBeGreaterThanOrEqual(0.7) }
  })
  it('kind precision/recall on fresh phrasings (out of sample)', () => {
    const fp = FRESH.map(([t, k]): [string, string] => [k, routeQuestion(q(t), eng).kind])
    const report = Object.fromEntries((['coding', 'system-design', 'behavioural', 'factual'] as const).map(k => [k, pr(fp, k)]))
    const acc = fp.filter(([e, g]) => e === g).length / fp.length
    console.info('routing P/R (fresh phrasings, n=' + fp.length + '):', JSON.stringify(report), 'accuracy', acc.toFixed(2))
    expect(acc).toBeGreaterThanOrEqual(0.7)
  })
  it('small talk is separated from real questions', () => {
    const p: Array<[string, string]> = [...SMALL.map((t): [string, string] => ['small-talk', routeQuestion(q(t), eng).kind]), ...NOT_SMALL.map((t): [string, string] => ['other', routeQuestion(q(t), eng).kind === 'small-talk' ? 'small-talk' : 'other'])]
    const r = pr(p, 'small-talk')
    console.info('small-talk P/R:', JSON.stringify(r))
    expect(r.precision).toBe(1); expect(r.recall).toBeGreaterThanOrEqual(0.85)
  })
  it('screenshot flag precision/recall', () => {
    const p: Array<[string, string]> = [...SCREEN.map((t): [string, string] => ['s', heuristicHint(t).needsScreenshot ? 's' : 'n']), ...NO_SCREEN.map((t): [string, string] => ['n', heuristicHint(t).needsScreenshot ? 's' : 'n'])]
    const r = pr(p, 's')
    console.info('needs_screenshot P/R:', JSON.stringify(r))
    expect(r.precision).toBe(1); expect(r.recall).toBeGreaterThanOrEqual(0.75)
  })
})
