// Quality guard: how often does the pipeline reach the same verdict as the full evaluator on a labelled sample?
// "Positive" = worth a closer look (fit >= threshold). Jobs the pipeline could not judge are counted, not scored.
import type { JobResult } from './types'

export type Labelled = { jobId: string; /** the full evaluator's 0-5 score */ ref: number }
export type Agreement = {
  n: number; judged: number; unjudged: number
  /** share of judged jobs where pipeline and reference agree on positive/negative */
  agreement: number
  /** Cohen's kappa on that decision (chance-corrected; 1 = perfect, 0 = chance) */
  kappa: number
  /** reference-positive jobs the pipeline called negative or dropped / all reference-positive */
  missedRate: number
  /** pipeline-positive jobs the reference called negative / all pipeline-positive (wasted deep evals) */
  falseAlarmRate: number
  /** reference-positive jobs dropped by the deterministic stages (0-2) — the part no model can recover */
  droppedEarly: number
  /** mean absolute error of the batched fit vs the reference, on jobs that reached the model */
  maeFit: number | null
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b)

export function agreement(results: JobResult[], labels: Labelled[], threshold = 3.5): Agreement {
  const by = new Map(results.map(r => [r.jobId, r]))
  let tp = 0, fp = 0, fn = 0, tn = 0, unjudged = 0, droppedEarly = 0
  const errs: number[] = []
  for (const l of labels) {
    const r = by.get(l.jobId)
    if (!r || r.fate === 'failed') { unjudged++; continue }
    const refPos = l.ref >= threshold
    const early = r.fate === 'skip' && r.stage !== 'llm'
    const predPos = !!r.light && r.light.fit >= threshold
    if (r.light) errs.push(Math.abs(r.light.fit - l.ref))
    if (refPos && early) droppedEarly++
    if (predPos && refPos) tp++; else if (predPos) fp++; else if (refPos) fn++; else tn++
  }
  const judged = tp + fp + fn + tn
  const po = ratio(tp + tn, judged)
  const pe = judged === 0 ? 0 : ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / (judged * judged)
  return {
    n: labels.length, judged, unjudged, agreement: Math.round(po * 1000) / 1000, kappa: pe === 1 ? 1 : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000,
    missedRate: Math.round(ratio(fn, tp + fn) * 1000) / 1000, falseAlarmRate: Math.round(ratio(fp, tp + fp) * 1000) / 1000, droppedEarly,
    maeFit: errs.length ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 100) / 100 : null,
  }
}
