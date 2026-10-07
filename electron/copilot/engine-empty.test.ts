import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { createAnswerEngine, type AnswerProvider, type StreamItem } from './engine'
import { buildGrounding, type JobSource } from './context'
import { SYSTEM_RULES } from './prompts'
import type { DetectedQuestion, Suggestion } from './types'

const q: DetectedQuestion = { id: 'q1', text: 'What are the algorithms used in graph?', type: 'other', confidence: 0.9, at: 0, auto: false }
const job: JobSource = { jobId: 'j', title: 'Platform Engineer', company: 'Acme Corp', report: null, rawReport: null, posting: null }
const grounding = () => buildGrounding(job, '# Asha\n- Built things')

async function run(streams: Record<string, StreamItem[]>) {
  const used: string[] = []
  const provider: AnswerProvider = { id: 'openrouter', stream: p => { used.push(p.model); return (async function* () { for (const i of streams[p.model] ?? streams['*']!) yield i })() } }
  const cfg = structuredClone(DEFAULT_CONFIG)
  const engine = createAnswerEngine({ provider, config: () => cfg, grounding, partialEveryMs: 0, sleep: async () => undefined })
  const out: Suggestion[] = []
  for await (const s of engine.answer({ question: q, transcript: [], kind: 'answer', signal: new AbortController().signal })) out.push(s)
  return { used, final: out.at(-1)! }
}

describe('empty model answers', () => {
  it('fails over to the next model when one streams nothing (a free model that returns an empty reply)', async () => {
    const first = (await run({ '*': [{ delta: '[SAY]\nBFS and DFS.' }] })).used[0]!
    const { used, final } = await run({ [first]: [{ delta: '  \n' }, { usage: { promptTokens: 5, completionTokens: 0 } }], '*': [{ delta: '[SAY]\nBFS, DFS, Dijkstra.' }] })
    expect(used.length).toBeGreaterThan(1)
    expect(final.say).toBe('BFS, DFS, Dijkstra.')
  })
  it('treats text without the [SAY] section (a model leaking its reasoning) as a failure and tries the next model', async () => {
    const first = (await run({ '*': [{ delta: '[SAY]\nok' }] })).used[0]!
    const leak = "Here's a thinking process:\n1. Analyze the question..."
    const { used, final } = await run({ [first]: [{ delta: leak }], '*': [{ delta: '[SAY]\nBFS, DFS, Dijkstra.\n[BULLETS]\n- BFS: shortest unweighted path' }] })
    expect(used.length).toBeGreaterThan(1)
    expect(final.say).toBe('BFS, DFS, Dijkstra.')
    expect(final.say).not.toMatch(/thinking process/i)
  })
})

describe('knowledge-first rules', () => {
  it('lets the copilot answer general questions and keeps personal claims grounded', () => {
    expect(SYSTEM_RULES).toMatch(/domain expert/)
    expect(SYSTEM_RULES).toMatch(/general to the field/)
    expect(SYSTEM_RULES).toMatch(/Claims about the candidate/)
    expect(SYSTEM_RULES).not.toMatch(/Ground every claim in CANDIDATE FACTS/)
  })
})
