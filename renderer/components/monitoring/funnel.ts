import { stageOf } from '../../lib/stages'
import type { Application } from '../../lib/types'

export type FunnelStage = { id: string; label: string; count: number }

const STAGES = [
  { id: 'evaluated', label: 'Evaluated' },
  { id: 'applied', label: 'Applied' },
  { id: 'responded', label: 'Responded' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
] as const

// Ladder position for "reached at least this stage". Hired is a fuller
// pursuit than Offer, so it counts as having reached Offer. Rejected/
// Discarded/Skip/other are absent on purpose: a row that left the pipeline
// only proves it was Evaluated — how much further it got isn't recorded.
const STAGE_RANK: Record<string, number> = { evaluated: 0, applied: 1, responded: 2, interview: 3, offer: 4, hired: 4 }

/** Cumulative "reached at least this stage" funnel — not a current-status
 *  snapshot, so a role that moved on still counts at every stage it passed. */
export function cumulativeFunnel(apps: Application[]): FunnelStage[] {
  return STAGES.map((stage, rank) => ({
    ...stage,
    count: apps.filter(a => (STAGE_RANK[stageOf(a.status)] ?? 0) >= rank).length,
  }))
}

/** True when some tracked role left the pipeline (Rejected/Discarded/Skip/
 *  unrecognized status) before an active stage — the funnel then needs its
 *  "we don't know how far they got" footnote. */
export function hasUnknownDepth(apps: Application[]): boolean {
  return apps.some(a => !(stageOf(a.status) in STAGE_RANK))
}
