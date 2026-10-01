// Small local golden KB (original synthetic text) in the shape WP1's fixtures will have; built from the contract types only.
import type { Difficulty, KbItem, KbQuestionType, Provenance, SkillNode } from '../../kb/types'

const item = (id: string, text: string, type: KbQuestionType, skills: string[], difficulty: Difficulty, provenance: Provenance = 'sourced', over: Partial<KbItem> = {}): KbItem => ({
  id, text, type, skills, difficulty, provenance,
  sources: provenance === 'sourced' ? [{ sourceId: 's1', note: 'synthetic' }] : [],
  seen: provenance === 'sourced' ? 2 : 0, confidence: provenance === 'sourced' ? 0.8 : 0.4,
  idealOutline: ['Set the scene', 'Say what you did', 'Give the result'],
  rubric: [{ criterion: 'Clear ownership', good: 'says I and what', weak: 'only we' }, { criterion: 'Concrete result', good: 'a number or outcome', weak: 'vague' }, { criterion: 'Trade-offs', good: 'names one', weak: 'none' }],
  followUps: [], redFlags: [], hooks: { storyIds: [], gap: null, cvFacts: [] },
  user: { pinned: false, hidden: false, edited: false, notes: null }, stats: { asked: 0, lastScore: null, avgScore: null }, ...over,
})

export const GOLDEN_SKILLS: SkillNode[] = [
  { id: 'k8s', name: 'Kubernetes', family: 'infra', origin: 'jd', expected: 'working', weight: 0.9, inCv: false },
  { id: 'py', name: 'Python', family: 'lang', origin: 'jd', expected: 'strong', weight: 0.8, inCv: true },
  { id: 'lead', name: 'Leadership', family: 'soft', origin: 'jd', expected: 'working', weight: 0.6, inCv: true },
  { id: 'sql', name: 'SQL', family: 'data', origin: 'jd', expected: 'working', weight: 0.5, inCv: true },
]

const beh = (n: number, skill: string, d: Difficulty, p: Provenance = 'sourced'): KbItem => item(`b${n}`, `Behavioural question ${n} about ${skill}?`, 'behavioural', [skill], d, p)
const tech = (n: number, skill: string, d: Difficulty, p: Provenance = 'sourced'): KbItem => item(`t${n}`, `Technical question ${n} about ${skill}?`, 'technical', [skill], d, p)

export const GOLDEN_POOL: KbItem[] = [
  beh(1, 'lead', 2), beh(2, 'lead', 3), beh(3, 'py', 3), beh(4, 'lead', 4), beh(5, 'sql', 3, 'generated'),
  tech(1, 'k8s', 3), tech(2, 'k8s', 3), tech(3, 'py', 3), tech(4, 'py', 4), tech(5, 'sql', 3), tech(6, 'k8s', 4), tech(7, 'py', 2, 'generated'), tech(8, 'sql', 4),
  item('d1', 'Design a rate limiter for a public API.', 'system-design', ['k8s'], 4),
  item('d2', 'Design a job queue with retries.', 'system-design', ['py'], 4, 'generated'),
  item('c1', 'Reverse a linked list in place.', 'coding', ['py'], 2),
  item('r1', 'Why are you looking for a change?', 'recruiter', [], 1),
  item('h1', 'Hidden question that must never be asked.', 'technical', ['py'], 3, 'sourced', { user: { pinned: false, hidden: true, edited: false, notes: null } }),
]
