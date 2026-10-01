// KbItem factory and the confidence rule shared by the pipeline stages.
import type { Difficulty, KbItem, KbQuestionType, Provenance } from '../types'
import { itemId } from './dedupe'

/** 0..1 = f(seen, trust, provenance). Generated never exceeds .4, user items are certain. */
export function confidenceOf(provenance: Provenance, seen: number, trust: 0 | 1 | 2): number {
  if (provenance === 'user') return 1
  if (provenance === 'generated') return 0.3
  return Math.min(1, +(0.3 + 0.15 * trust + 0.15 * Math.min(Math.max(seen, 1) - 1, 3)).toFixed(2))
}

export function makeItem(o: { text: string; type: KbQuestionType; skills: string[]; difficulty: Difficulty; provenance: Provenance; sources?: KbItem['sources']; trust?: 0 | 1 | 2 }): KbItem {
  const sources = o.sources ?? []
  const seen = o.provenance === 'sourced' ? Math.max(sources.length, 1) : 0
  return {
    id: itemId(o.text), text: o.text, type: o.type, skills: o.skills, difficulty: o.difficulty, provenance: o.provenance, sources, seen,
    confidence: confidenceOf(o.provenance, seen, o.trust ?? 0),
    idealOutline: [], rubric: [], followUps: [], redFlags: [],
    hooks: { storyIds: [], gap: null, cvFacts: [] },
    user: { pinned: false, hidden: false, edited: false, notes: null },
    stats: { asked: 0, lastScore: null, avgScore: null },
  }
}
