// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { Scorecard } from './types'

/** Owner: WP4. Text-only scoring run (cheap model); explicit Apply writes to résumé bullets / job notes. */
export interface Debriefer {
  score(sessionId: string): Promise<Scorecard>
  apply(sessionId: string, questionId: string, action: 'resume-bullet' | 'job-note'): Promise<{ ok: boolean }>
}
