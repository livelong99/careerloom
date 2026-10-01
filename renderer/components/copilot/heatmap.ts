// Skill × criterion heat map for the interviewer debrief (design §3.4): pure, so it is tested without the DOM.
import type { QuestionResult } from '@/lib/types'

export const AXES = ['Structure', 'Specifics', 'Evidence', 'Concision'] as const
export type HeatRow = { label: string; cells: Array<number | null> }

const round1 = (n: number): number => Math.round(n * 10) / 10

/** `labelsOf(itemId)` names the rows a question counts toward (its skills, or the question itself); unscored and skipped answers are left out. */
export function heatRows(results: QuestionResult[], labelsOf: (itemId: string) => string[]): HeatRow[] {
  const acc = new Map<string, number[][]>()
  for (const r of results) {
    if (r.skipped || r.score === null) continue
    const axis = AXES.map(a => r.criteria.find(c => c.criterion.toLowerCase() === a.toLowerCase())?.score ?? null)
    for (const label of labelsOf(r.itemId)) {
      const rows = acc.get(label) ?? AXES.map(() => [])
      axis.forEach((v, i) => { if (v !== null) rows[i]!.push(v) })
      acc.set(label, rows)
    }
  }
  return [...acc].map(([label, cols]) => ({ label, cells: cols.map(v => (v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null)) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** The one criterion with evidence that scored lowest: the line the debrief quotes for a question. */
export function weakestEvidence(r: QuestionResult): { criterion: string; evidence: string } | null {
  const rows = r.criteria.filter(c => c.evidence).sort((a, b) => a.score - b.score)
  return rows[0] ? { criterion: rows[0].criterion, evidence: rows[0].evidence } : null
}
