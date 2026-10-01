// File-backed run checkpoint (`run.json`, deleted on completion) and the query/page caches (plan §5). Atomic writes, 0600/0700.
// Only OUR derived data lands here: search results (url, title, ≤ 200-char snippet) and extracted items. Never page text.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { KbQuestionType, SourceKind } from '../types'
import type { NoteKind } from './extract'
import type { SearchResult } from './search/adapter'

export const QUERY_TTL_MS = 7 * 86_400_000
export const PAGE_TTL_MS = 14 * 86_400_000
/** A page that yielded nothing (403, empty, robots, injection …) is not retried for a day (research B2 §6). */
export const NEGATIVE_TTL_MS = 86_400_000
const fresh = (rec: PageRecord | null, now: number): PageRecord | null => (rec && now - rec.at < (rec.skipped ? NEGATIVE_TTL_MS : PAGE_TTL_MS) ? rec : null)

export type PageRecord = {
  url: string; title: string; contentHash: string; kind: SourceKind; licence: string | null; trust: 0 | 1 | 2
  candidates: Array<{ text: string; type?: KbQuestionType; skills?: string[]; note: string }>
  notes: Array<{ kind: NoteKind; text: string }>
  /** Why the page yielded nothing, counted in the summary. */
  skipped?: 'injection' | 'robots' | 'denied' | 'ssrf' | 'http' | 'empty' | 'invalid'
  at: number
}
export type Checkpoint = {
  schema: 1; jobId: string; inputHash: string; startedAt: number
  spentUsd: number; searches: number
  queries: Record<string, SearchResult[]>
  pages: Record<string, PageRecord>
}

export interface ResearchState {
  loadRun(jobId: string): Checkpoint | null
  saveRun(run: Checkpoint): void
  clearRun(jobId: string): void
  getQuery(backend: string, query: string): SearchResult[] | null
  putQuery(backend: string, query: string, results: SearchResult[]): void
  getPage(url: string): PageRecord | null
  putPage(rec: PageRecord): void
}

const key = (...parts: string[]): string => createHash('sha1').update(parts.join('\u0000')).digest('hex')
/** Same recipe as hash.ts `queryKey`/`pageKey` (WP1). TODO(integration): import them from '../../hash' once WP1 is merged; pinned by hash-parity.test.ts. */
export const queryKey = (backend: string, query: string): string => key(backend, query.trim().toLowerCase())
export const pageKey = (url: string): string => key(url)

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  fs.renameSync(tmp, file)
}
const readJson = <T>(file: string): T | null => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch { return null } }

/** `root` = userData/kb; `jobDir` maps a job id to its folder name (the job id is a URL, so it is never a path itself). */
export function openResearchState(root: () => string, jobDir: (jobId: string) => string, now: () => number = Date.now): ResearchState {
  const run = (jobId: string) => path.join(root(), jobDir(jobId), 'run.json')
  const q = (backend: string, query: string) => path.join(root(), '_cache', 'queries', `${queryKey(backend, query)}.json`)
  const p = (url: string) => path.join(root(), '_cache', 'pages', `${pageKey(url)}.json`)
  return {
    loadRun: jobId => { const c = readJson<Checkpoint>(run(jobId)); return c?.schema === 1 ? c : null },
    saveRun: c => writeJson(run(c.jobId), c),
    clearRun: jobId => fs.rmSync(run(jobId), { force: true }),
    getQuery: (backend, query) => {
      const hit = readJson<{ at: number; results: SearchResult[] }>(q(backend, query))
      return hit && now() - hit.at < QUERY_TTL_MS ? hit.results : null
    },
    putQuery: (backend, query, results) => writeJson(q(backend, query), { query, backend, results, at: now() }),
    getPage: url => fresh(readJson<PageRecord>(p(url)), now()),
    putPage: rec => writeJson(p(rec.url), rec),
  }
}

/** Test/dry-run state that never touches disk. */
export function memoryResearchState(now: () => number = Date.now): ResearchState & { runs: Map<string, Checkpoint> } {
  const runs = new Map<string, Checkpoint>()
  const queries = new Map<string, { at: number; results: SearchResult[] }>()
  const pages = new Map<string, PageRecord>()
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  return {
    runs,
    loadRun: jobId => { const c = runs.get(jobId); return c ? clone(c) : null },
    saveRun: c => { runs.set(c.jobId, clone(c)) },
    clearRun: jobId => { runs.delete(jobId) },
    getQuery: (b, query) => { const h = queries.get(queryKey(b, query)); return h && now() - h.at < QUERY_TTL_MS ? clone(h.results) : null },
    putQuery: (b, query, results) => { queries.set(queryKey(b, query), { at: now(), results: clone(results) }) },
    getPage: url => { const h = fresh(pages.get(pageKey(url)) ?? null, now()); return h ? clone(h) : null },
    putPage: rec => { pages.set(pageKey(rec.url), clone(rec)) },
  }
}
