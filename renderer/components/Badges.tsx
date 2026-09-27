import { stageLabel, stageOf } from '../lib/stages'

/** career-ops' 1–5 fit score, colored by band (≥4 strong, ≥3 maybe). */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="score">—</span>
  const band = score >= 4 ? 'hi' : score >= 3 ? 'mid' : 'lo'
  return <span className={`score ${band}`}>{score.toFixed(1)}</span>
}

export function StageBadge({ status }: { status: string }) {
  const stage = stageOf(status)
  return <span className={`stage stage-${stage}`}>{stage === 'other' ? status : stageLabel(stage)}</span>
}
