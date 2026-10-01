// Original synthetic golden KBs (no third-party text): 40 hand-written items + 360 seeded distractors = 400.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { itemId } from '../hash'
import type { Expected, KbItem, KbQuestionType, SkillNode } from '../types'

const dir = join(process.cwd(), 'electron/kb/fixtures')
const json = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T
type GoldenItem = [key: string, type: KbQuestionType, skills: string[], confidence: number, text: string, outline: string[], followUps: string[]]

export const makeItem = (text: string, over: Partial<KbItem> = {}): KbItem => ({
  id: itemId(text), text, type: 'technical', skills: [], difficulty: 3, provenance: 'sourced', sources: [], seen: 1, confidence: 0.7,
  idealOutline: [], rubric: [], followUps: [], redFlags: [], hooks: { storyIds: [], gap: null, cvFacts: [] },
  user: { pinned: false, hidden: false, edited: false, notes: null }, stats: { asked: 0, lastScore: null, avgScore: null }, ...over,
})

const raw = json<{ skills: Array<[string, string, string]>; items: GoldenItem[] }>('golden-40.json')
export const goldenSkills = (): SkillNode[] => raw.skills.map(([id, name, family], i) => ({ id, name, family, origin: 'jd' as const, expected: 'working' as Expected, weight: 1 - i * 0.05, inCv: i % 2 === 0 }))
/** key → item (keys are only for the labelled set). */
export const golden40 = (): Array<{ key: string; item: KbItem }> =>
  raw.items.map(([key, type, skills, confidence, text, idealOutline, followUps]) => ({ key, item: makeItem(text, { type, skills, confidence, idealOutline, followUps }) }))

// Distractors share generic interview vocabulary with the golden set on purpose (a retrieval test with disjoint words proves nothing).
const VERBS = ['migrate', 'monitor', 'benchmark', 'refactor', 'secure', 'scale', 'audit', 'schedule', 'archive', 'partition']
const NOUNS = ['billing service', 'search cluster', 'mobile client', 'analytics pipeline', 'payment webhook', 'image uploader', 'notification queue', 'admin console', 'reporting job', 'session store']
const CONTEXTS = ['during a holiday traffic spike', 'with a three person team', 'under a strict compliance review', 'after a surprise outage', 'while the schema keeps changing', 'on a tiny budget', 'across two regions', 'with legacy code']
const STEMS = ['How would you {v} a {n} {c}?', 'Describe how you would {v} the {n} {c}.', 'What risks do you weigh when you {v} a {n} {c}?', 'Explain your approach to {v} our {n} {c}.']
const TYPES: KbQuestionType[] = ['technical', 'technical', 'system-design', 'situational', 'behavioural']

export const golden400 = (): KbItem[] => {
  let s = 20261002
  const next = (n: number): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s >>> 8) % n } // high bits: the low bits of an LCG cycle with a tiny period
  const out = golden40().map(g => g.item)
  const seen = new Set(out.map(i => i.id))
  while (out.length < 400) {
    const text = STEMS[next(STEMS.length)]!.replace('{v}', VERBS[next(VERBS.length)]!).replace('{n}', NOUNS[next(NOUNS.length)]!).replace('{c}', CONTEXTS[next(CONTEXTS.length)]!)
    const id = itemId(text)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(makeItem(text, { type: TYPES[next(TYPES.length)]!, confidence: 0.3 + next(60) / 100, provenance: next(3) === 0 ? 'generated' : 'sourced' }))
  }
  return out
}
export const labelled = (): Array<{ key: string; query: string }> => json<Array<[string, string]>>('labelled.json').map(([key, query]) => ({ key, query }))
