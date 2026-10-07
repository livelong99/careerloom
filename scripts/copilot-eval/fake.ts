// Scripted provider for the harness self-test and offline runs. 'good' composes a format-compliant answer out of each question's own
// rubric words, so it proves the plumbing and the scorer, NOT any prompt: only a real model answers differently when the prompt changes.
import type { AnswerProvider, ProviderPrompt, StreamItem } from '../../electron/copilot/engine'
import type { EvalQuestion } from './score'

export type FakeMode = 'good' | 'noformat' | 'long' | 'markdown' | 'invent' | 'leak' | 'wrong'

const literal = (group: string): string => (group.split('|')[0] ?? '').replace(/\.\?/g, ' ').replace(/[\\?]/g, '').replace(/\s+/g, ' ').trim()
const SAY: Record<string, string> = {
  noexp: "I haven't used it directly, so I'll answer from general knowledge.",
  clarify: 'Do you mean the general case? I would assume so.',
  decline: "I'd rather keep this focused on the role.",
  premise: "I didn't work there; my roles were Northwind, Contoso and Fabrikam.",
}
const good = (q: EvalQuestion): string => `[SAY]\n${SAY[q.expect ?? ''] ?? 'The short answer follows from the key points below.'}\n[BULLETS]\n${q.rubric.slice(0, 4).map(g => `- ${literal(g)}`).join('\n')}\n`

export function fakeText(q: EvalQuestion, mode: FakeMode): string {
  switch (mode) {
    case 'good': return good(q)
    case 'noformat': return `The answer is that you should consider ${q.rubric.map(literal).join(', ')}.`
    case 'long': return `[SAY]\n${'This is a very long spoken sentence that keeps going on and on without ever reaching a point '.repeat(4)}\n[BULLETS]\n- ${literal(q.rubric[0] ?? '')}\n`
    case 'markdown': return `[SAY]\n**Key point:** ${literal(q.rubric[0] ?? '')} 🚀\n[BULLETS]\n- ${literal(q.rubric[0] ?? '')}\n`
    case 'invent': return '[SAY]\nI led the Spark rollout at Google, saving $9M, and we scaled it to 500 services.\n[BULLETS]\n- I ran Spark at Google for years\n'
    case 'leak': return `Okay, the user is asking about this. Let me think about the rules first.\n${good(q)}`
    case 'wrong': return '[SAY]\nParis is the capital of France.\n[BULLETS]\n- It is a city\n'
  }
}

/** Streams a fixed reply (hand-written realistic answers in the scorer tests). */
export const textProvider = (t: string): AnswerProvider => ({
  id: 'openrouter',
  async *stream(_p: ProviderPrompt): AsyncGenerator<StreamItem> {
    for (let i = 0; i < t.length; i += 24) yield { delta: t.slice(i, i + 24) }
    yield { usage: { promptTokens: 1000, completionTokens: Math.ceil(t.length / 4), costUsd: 0 } }
  },
})

export function fakeProvider(q: EvalQuestion, mode: FakeMode): AnswerProvider {
  return {
    id: 'openrouter',
    async *stream(_p: ProviderPrompt): AsyncGenerator<StreamItem> {
      const t = fakeText(q, mode)
      for (let i = 0; i < t.length; i += 24) yield { delta: t.slice(i, i + 24) }
      yield { usage: { promptTokens: 1000, completionTokens: Math.ceil(t.length / 4), costUsd: 0 } }
    },
  }
}
