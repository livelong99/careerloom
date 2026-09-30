// Session store: original code. (Open-Cluely's app-state.js is a flat settings file with plaintext keys and no sessions, so there was nothing to port.)
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ConsentRecord, CopilotMode, DetectedQuestion, SessionDetail, SessionSummary, Suggestion, TranscriptLine } from './types'

const DAY = 86_400_000
const ID = /^[\w-]{1,80}$/

/** userData/copilot: sessions/<id>.json (0600), index.json (rebuildable), consent.jsonl (append-only, 0600). */
export interface SessionStore {
  list(filter?: { jobId?: string }): SessionSummary[]
  get(id: string): SessionDetail | null
  save(detail: SessionDetail): void
  remove(id: string | 'all'): number
  /** Scores of one Job's sessions, oldest first (Job page / Sessions trend). */
  trend(jobId: string): Array<{ sessionId: string; at: number; score: number | null }>
  appendConsent(record: ConsentRecord): void
  consents(): ConsentRecord[]
  /** Retention sweep (app start, session end, setting change). Returns sessions that lost their text. */
  sweep(retentionDays: number | null, now?: number): number
  /** Sessions a sweep at this value would strip right now (for the confirm dialog). Deletes nothing. */
  expiring(retentionDays: number | null, now?: number): number
}

const summaryOf = (d: SessionDetail): SessionSummary => ({
  id: d.id, startedAt: d.startedAt, endedAt: d.endedAt, mode: d.mode, jobId: d.jobId, jobTitle: d.jobTitle, company: d.company,
  questions: d.questions, durationSec: d.durationSec, score: d.score,
})
const checkId = (id: string): string => { if (!ID.test(id)) throw new Error('Invalid session id'); return id }
const hasText = (d: SessionDetail): boolean => d.transcript.length > 0 || d.questionsList.some(q => q.text !== '')

function writeJson(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  renameSync(tmp, file)
}

export function openSessionStore(dir: string): SessionStore {
  const sessions = join(dir, 'sessions')
  const indexFile = join(dir, 'index.json')
  const consentFile = join(dir, 'consent.jsonl')
  mkdirSync(sessions, { recursive: true, mode: 0o700 })

  const readSession = (id: string): SessionDetail | null => {
    try { return JSON.parse(readFileSync(join(sessions, `${checkId(id)}.json`), 'utf8')) as SessionDetail } catch (err) { if (err instanceof Error && err.message === 'Invalid session id') throw err; return null }
  }
  const rebuild = (): Record<string, SessionSummary> => {
    const out: Record<string, SessionSummary> = {}
    for (const f of readdirSync(sessions)) {
      if (!f.endsWith('.json')) continue
      const d = readSession(f.slice(0, -5))
      if (d) out[d.id] = summaryOf(d)
    }
    return out
  }
  let index: Record<string, SessionSummary> | null = null
  const load = (): Record<string, SessionSummary> => {
    if (index) return index
    try {
      const raw = JSON.parse(readFileSync(indexFile, 'utf8')) as { summaries?: Record<string, SessionSummary> }
      if (raw.summaries && typeof raw.summaries === 'object') return (index = raw.summaries)
    } catch { /* missing or corrupt: rebuild from the session files */ }
    index = rebuild()
    writeJson(indexFile, { summaries: index })
    return index
  }
  const persist = (): void => writeJson(indexFile, { summaries: load() })
  const ended = (s: SessionSummary): number => s.endedAt ?? s.startedAt
  // 0 = drop text as soon as a session has ended; N = older than N days (a crashed, never-ended session ages from its start).
  const isOld = (s: SessionSummary, days: number, now: number): boolean => (days === 0 ? s.endedAt !== null : now - ended(s) > days * DAY)

  const self: SessionStore = {
    list: filter => Object.values(load()).filter(s => !filter?.jobId || s.jobId === filter.jobId).sort((a, b) => b.startedAt - a.startedAt),
    get: id => readSession(id),
    save(d) {
      if (typeof d.jobId !== 'string' || d.jobId.trim() === '') throw new Error('Every session belongs to a job: pick one first')
      checkId(d.id)
      writeJson(join(sessions, `${d.id}.json`), d)
      load()[d.id] = summaryOf(d)
      persist()
    },
    remove(id) {
      const ids = id === 'all' ? Object.keys(load()) : [checkId(id)].filter(i => i in load() || existsSync(join(sessions, `${i}.json`)))
      for (const i of ids) { rmSync(join(sessions, `${i}.json`), { force: true }); delete load()[i] }
      if (ids.length) persist()
      return ids.length
    },
    trend: jobId => self.list({ jobId }).reverse().map(s => ({ sessionId: s.id, at: s.startedAt, score: s.score })),
    appendConsent(r) {
      mkdirSync(dir, { recursive: true })
      appendFileSync(consentFile, `${JSON.stringify(r)}\n`, { mode: 0o600 })
      chmodSync(consentFile, 0o600)
    },
    consents() {
      if (!existsSync(consentFile)) return []
      return readFileSync(consentFile, 'utf8').split('\n').flatMap(l => { try { return l.trim() ? [JSON.parse(l) as ConsentRecord] : [] } catch { return [] } })
    },
    sweep(days, now = Date.now()) {
      if (days === null) return 0
      let n = 0
      for (const s of Object.values(load())) {
        if (!isOld(s, days, now)) continue
        const d = readSession(s.id)
        if (!d || !hasText(d)) continue
        writeJson(join(sessions, `${d.id}.json`), { ...d, transcript: [], questionsList: d.questionsList.map(q => ({ ...q, text: '' })) })
        n++
      }
      return n
    },
    expiring(days, now = Date.now()) {
      if (days === null) return 0
      return Object.values(load()).filter(s => { const d = isOld(s, days, now) ? readSession(s.id) : null; return d !== null && hasText(d) }).length
    },
  }
  return self
}

export type SessionMeta = { id: string; mode: CopilotMode; jobId: string; jobTitle: string; company: string }
/** Collects the running session's events (fed by the capture/engine/practice code) and persists it at begin, on each question and at end. */
export type Recorder = {
  begin(meta: SessionMeta): void
  line(l: TranscriptLine): void
  question(q: DetectedQuestion): void
  suggestion(s: Suggestion): void
  end(): SessionDetail | null
  active(): string | null
}

const upsert = <T>(list: T[], item: T, same: (a: T) => boolean): T[] => { const i = list.findIndex(same); return i < 0 ? [...list, item] : list.map((x, j) => (j === i ? item : x)) }

export function createRecorder(store: SessionStore, now: () => number = Date.now): Recorder {
  let cur: SessionDetail | null = null
  const save = (): void => { if (cur) store.save(cur) }
  return {
    begin(m) {
      const at = now()
      const fresh: SessionDetail = { ...m, startedAt: at, endedAt: null, questions: 0, durationSec: 0, score: null, transcript: [], questionsList: [], suggestions: [], scorecard: null }
      store.save(fresh) // throws without a job: nothing starts recording
      cur = fresh
    },
    line(l) { if (cur) cur = { ...cur, transcript: upsert(cur.transcript, l, x => x.id === l.id) } },
    question(q) {
      if (!cur) return
      const questionsList = upsert(cur.questionsList, q, x => x.id === q.id)
      cur = { ...cur, questionsList, questions: questionsList.length }
      save()
    },
    suggestion(s) { if (cur) cur = { ...cur, suggestions: upsert(cur.suggestions, s, x => x.questionId === s.questionId) } },
    end() {
      if (!cur) return null
      const endedAt = now()
      const done: SessionDetail = { ...cur, endedAt, durationSec: Math.max(0, Math.round((endedAt - cur.startedAt) / 1000)) }
      cur = null
      store.save(done)
      return done
    },
    active: () => cur?.id ?? null,
  }
}
