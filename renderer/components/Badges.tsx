import { stageLabel, stageOf } from '../lib/stages'

/** career-ops' 1–5 fit score, colored by band (≥4 strong, ≥3 maybe). */
export function ScoreBadge({ score, quick }: { score: number | null; quick?: boolean }) {
  if (score === null) return <span className="score">—</span>
  const band = score >= 4 ? 'hi' : score >= 3 ? 'mid' : 'lo'
  if (quick) return <span className={`score ${band}`} title="Quick triage score, not a full evaluation — use Re-evaluate for the deep report">~{score.toFixed(1)}</span>
  return <span className={`score ${band}`}>{score.toFixed(1)}</span>
}

export function StageBadge({ status }: { status: string }) {
  const stage = stageOf(status)
  return <span className={`stage stage-${stage}`}>{stage === 'other' ? status : stageLabel(stage)}</span>
}
