// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { ConsentRecord, SessionDetail, SessionSummary } from './types'

/** Owner: WP4. userData/copilot/sessions/<id>.json (0600), index.json, consent.jsonl (append-only). */
export interface SessionStore {
  list(filter?: { jobId?: string }): SessionSummary[]
  get(id: string): SessionDetail | null
  save(detail: SessionDetail): void
  remove(id: string | 'all'): number
  appendConsent(record: ConsentRecord): void
  /** Retention sweep (app start, session end, setting change). Returns sessions that lost their text. */
  sweep(retentionDays: number | null, now?: number): number
}
