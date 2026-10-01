// Live/practice retrieval over a job's KB (plan §6.1). Synchronous: the index is cached per job and rebuilt when the store revision moves.
import { estimateTokens } from '../copilot/context'
import { buildIndex, scoreQuery, tokenize, type Bm25Index } from './bm25'
import type { KbItem, KbQuestionType } from './types'
import type { KbStore } from './store'

let bound: KbStore | null = null
/** Called once at startup (main) and in tests; retrieval has no other way to find the data. */
export const bindKbStore = (store: KbStore): void => { bound = store; indexes.clear() }
const need = (): KbStore => { if (!bound) throw new Error('Knowledge base store is not bound'); return bound }

export type RetrieveOpts = { type?: KbQuestionType; k?: number }
const indexes = new Map<string, { rev: number; index: Bm25Index }>()
const indexOf = (store: KbStore, jobId: string): Bm25Index => {
  const rev = store.revision(jobId)
  const hit = indexes.get(jobId)
  if (hit && hit.rev === rev) return hit.index
  const { items, skills } = store.read(jobId)
  const names = new Map(skills.map(s => [s.id, s.name]))
  const index = buildIndex(items.map(i => ({ id: i.id, fields: [{ text: i.text, boost: 3 }, { text: [...i.skills.map(s => names.get(s) ?? s), ...i.followUps].join(' '), boost: 2 }, { text: i.idealOutline.join(' '), boost: 1 }] })))
  indexes.set(jobId, { rev, index })
  return index
}

export const retrieve = (jobId: string, query: string, opts: RetrieveOpts = {}): KbItem[] => {
  const store = need()
  const { items, skills } = store.read(jobId)
  if (!items.length || tokenize(query).length === 0) return []
  const byId = new Map(items.map(i => [i.id, i]))
  const q = new Set(tokenize(query))
  const inQuestion = new Set(skills.filter(s => { const t = tokenize(s.name); return t.length > 0 && t.every(x => q.has(x)) }).map(s => s.id))
  const k = opts.k ?? 3
  return scoreQuery(indexOf(store, jobId), query, items.length)
    .flatMap(({ id, score }) => {
      const item = byId.get(id)!
      if (item.user.hidden) return []
      const bonus = 1 + 0.15 * item.skills.filter(s => inQuestion.has(s)).length
      return [{ item, score: score * (0.6 + 0.4 * item.confidence) * (!opts.type || item.type === opts.type ? 1 : 0.7) * bonus * (item.user.pinned ? 1.1 : 1) }]
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k).map(r => r.item)
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()
/** Deterministic, byte-stable `## QUESTION BASE` block for the grounding prefix (≤ budgetTokens): same KB ⇒ same bytes (prompt-cache friendly). Trimmed from the end. */
export const kbPrefix = (jobId: string, budgetTokens = 700): string => {
  const { items, skills, notes } = need().read(jobId)
  const live = items.filter(i => !i.user.hidden)
  if (!live.length) return ''
  const lines = ['## QUESTION BASE (questions this interviewer may ask; never claims about the candidate)']
  const top = [...skills].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)).slice(0, 6)
  if (top.length) lines.push('Skills: ' + top.map(s => `${s.name} (${s.expected})`).join(', '))
  // Insertion order breaks ties, so a re-sorted copy never changes the bytes.
  const picks = [...live].sort((a, b) => Number(b.user.pinned) - Number(a.user.pinned) || b.confidence - a.confidence).slice(0, 8)
  for (const i of picks) lines.push(`- Q: ${oneLine(i.text)}${i.idealOutline[0] ? ` → ${oneLine(i.idealOutline[0])}` : ''}`)
  for (const n of [...notes.company, ...notes.role, ...notes.loop].slice(0, 3)) lines.push(`Note: ${oneLine(n)}`)
  const out: string[] = []
  for (const l of lines) {
    if (estimateTokens([...out, l].join('\n')) > budgetTokens) break
    out.push(l)
  }
  return out.join('\n')
}

/** Items the interviewer may pick from (hidden excluded), in stored order. */
export const selectionPool = (jobId: string): KbItem[] => need().read(jobId).items.filter(i => !i.user.hidden)
