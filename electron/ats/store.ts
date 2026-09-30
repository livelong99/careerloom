// Persistence for ATS analyses: the current one, a small cache keyed by content hash, and the undo stack. JSON files in `dir`.
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { AtsAnswer, AtsFinding, AtsQuestion, AtsReport } from '../contract'
import type { LlmExtraction } from './llm'
import type { UndoEntry } from './apply'

export const sha = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16)
export const ENGINE_VERSION = '1' // bump when scoring changes so cached reports are recomputed

export type Session = { runner: string; sessionId: string | null; round: number; asked: number; questions: AtsQuestion[]; answers: AtsAnswer[]; partial?: string; repaired?: boolean }
export type Analysis = {
  id: string
  createdAt: number
  templateId: string
  jd: string
  /** cache key: hash of cv + jd + template + engine */
  key: string
  extraction: LlmExtraction | null
  /** findings the agent proposed (validated); deterministic ones are rebuilt on every score */
  agentFindings: AtsFinding[]
  hints: Record<string, string>
  courses: AtsReport['courses']
  plan?: string
  notes: string[]
  /** all questions asked so far, and every answer given (merged into Apply so {{qN}} placeholders resolve) */
  questions?: AtsQuestion[]
  answers?: AtsAnswer[]
  session?: Session
  report: AtsReport
}

/** Each job keeps its own analysis folder under `<base>/jobs/`, so it never touches the résumé-level one. */
export const jobStoreDir = (base: string, jobId: string) => join(base, 'jobs', sha(jobId))

export type Store = {
  current(): Analysis | null
  save(a: Analysis): void
  cacheGet(key: string): Analysis | null
  cachePut(a: Analysis): void
  undo(): UndoEntry[]
  setUndo(list: UndoEntry[]): void
}

const CACHE_KEEP = 20

function readJson<T>(file: string): T | null { try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return null } }
function writeJson(file: string, data: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.${randomUUID().slice(0, 6)}.tmp`
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  renameSync(tmp, file)
}

export function openStore(dir: string): Store {
  const cacheDir = join(dir, 'cache')
  return {
    current: () => readJson<Analysis>(join(dir, 'current.json')),
    save: a => writeJson(join(dir, 'current.json'), a),
    cacheGet: key => readJson<Analysis>(join(cacheDir, `${key.replace(/[^\w-]/g, '')}.json`)),
    cachePut: a => {
      writeJson(join(cacheDir, `${a.key.replace(/[^\w-]/g, '')}.json`), a)
      try {
        const files = readdirSync(cacheDir).map(f => ({ f, t: statSync(join(cacheDir, f)).mtimeMs })).sort((x, y) => y.t - x.t)
        for (const { f } of files.slice(CACHE_KEEP)) rmSync(join(cacheDir, f), { force: true })
      } catch { /* trimming is best effort */ }
    },
    undo: () => readJson<UndoEntry[]>(join(dir, 'undo.json')) ?? [],
    setUndo: list => writeJson(join(dir, 'undo.json'), list),
  }
}
