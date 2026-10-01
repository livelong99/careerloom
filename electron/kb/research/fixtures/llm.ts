// Scripted model for the research tests: reads the structured prompts the pipeline sends and answers deterministically.
import type { PipelineDeps } from '../pipeline'

export type FakeLlm = { call: PipelineDeps['llm']; calls: { extract: number; enrich: number; generate: number; classify: number; other: number }; seen: string[] }

export function createFakeLlm(o: { usd?: number; fail?: (kind: string, n: number) => Error | null; hallucinate?: boolean } = {}): FakeLlm {
  const calls = { extract: 0, enrich: 0, generate: 0, classify: 0, other: 0 }
  const seen: string[] = []
  const call: PipelineDeps['llm'] = async (system, user, signal) => {
    signal.throwIfAborted()
    seen.push(user)
    const kind = system.startsWith('You extract') ? 'extract' : system.startsWith('You prepare') ? 'enrich' : system.startsWith('You write') ? 'generate' : system.startsWith('Classify') ? 'classify' : 'other'
    calls[kind]++
    const err = o.fail?.(kind, calls[kind])
    if (err) throw err
    const usd = o.usd ?? 0.002
    if (kind === 'extract') {
      const page = user.split('\n')
      const questions = page.filter(l => l.startsWith('Q: ')).map(l => ({ text: l.slice(3), evidence: l, note: 'A synthetic practice question.' }))
      if (o.hallucinate) questions.push({ text: 'Explain how a quantum compiler schedules qubits on a mesh?', evidence: 'This sentence never appears anywhere on the page text at all', note: 'invented' })
      const notes = page.flatMap(l => { const m = /^NOTE\((\w+)\): (.+)$/.exec(l); return m ? [{ kind: m[1], text: m[2], evidence: l }] : [] })
      return { text: JSON.stringify({ questions, notes }), usd }
    }
    if (kind === 'enrich') {
      const rows = user.split('\n').filter(Boolean).map((_, i) => ({ i, idealOutline: ['State the goal', 'Walk the approach', 'Name a trade-off'], rubric: [{ criterion: 'Clarity', good: 'Plain and ordered', weak: 'Rambling' }, { criterion: 'Depth', good: 'Concrete detail', weak: 'Generic' }, { criterion: 'Trade-offs', good: 'Names the cost', weak: 'None' }], followUps: ['What would you change at ten times the load?'], redFlags: ['Blames others'] }))
      return { text: JSON.stringify(rows), usd }
    }
    if (kind === 'generate') {
      const rows = [...user.matchAll(/^- (.+?): (\d+) question/gm)].flatMap(m => Array.from({ length: Number(m[2]) }, (_, k) => ({ skill: m[1], text: `Explain a real situation where ${m[1]} mattered to you, variation ${k + 1}?`, type: 'technical', difficulty: 3 })))
      return { text: JSON.stringify(rows), usd }
    }
    return { text: '{"type":"technical","skills":[],"difficulty":3}', usd }
  }
  return { call, calls, seen }
}
