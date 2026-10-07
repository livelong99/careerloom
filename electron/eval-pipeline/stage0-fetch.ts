// Stage 0: drop what the title/place already rules out (no fetch), fetch each remaining JD once, drop duplicates
// (same text for the same place) and reuse cached verdicts.
import type { EvalJob, FetchedJob, JobResult, Light } from './types'
import { pool, readJson, sha, writeJson } from './util'

const norm = (s: string) => s.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
/** Fingerprint of the posting's text AND place, ignoring case, spacing and tracking links. The same JD posted for two
 *  locations is two jobs (one may fail the location gate, the other not), so location is part of it. */
export const jdHash = (jd: string, location: string | null = null) => sha(`${norm(jd)}|${norm(location ?? '')}`)
/** Bump when the batched prompt/schema changes: older cached verdicts then read as misses. */
export const LIGHT_VERSION = 'l1'
export type VerdictCache = { get(key: string): Light | undefined; set(key: string, v: Light): void; flush(): void }

/** JSON file cache: jdHash|profileKey → Light. */
export function fileCache(file: string): VerdictCache {
  const map = new Map<string, Light>(Object.entries(readJson<Record<string, Light>>(file) ?? {}))
  return { get: k => map.get(k), set: (k, v) => { map.set(k, v) }, flush: () => writeJson(file, Object.fromEntries(map)) }
}
export const cacheKey = (hash: string, profileKey: string) => `${hash}|${profileKey}|${LIGHT_VERSION}`

export type Stage0Deps = {
  /** Cheap gate on what is known before the JD (title, place): a reason drops the job without fetching it. */
  gate?: (job: EvalJob) => string | null
  /** Returns the JD text, '' when unavailable. Throwing counts as unavailable. */
  fetchJd: (job: EvalJob) => Promise<string>
  cache: VerdictCache
  profileKey: string
  concurrency: number
  signal?: AbortSignal
  /** Per-URL JD store so a resumed run never refetches. */
  jdStore?: { get(url: string): string | undefined; set(url: string, jd: string): void }
}

export type Stage0Out = { fetched: FetchedJob[]; settled: JobResult[]; errors: number }

export async function stage0(jobs: EvalJob[], deps: Stage0Deps): Promise<Stage0Out> {
  const settled: JobResult[] = []
  const unique: EvalJob[] = []
  for (const j of jobs) {
    const why = deps.gate?.(j)
    if (why) settled.push({ jobId: j.id, fate: 'skip', stage: 'filter', reason: why, local: null, light: null })
    else unique.push(j)
  }

  let errors = 0
  const docs = await pool(unique, deps.concurrency, async j => {
    const stored = deps.jdStore?.get(j.url)
    if (stored !== undefined) return stored
    try {
      const jd = await deps.fetchJd(j)
      if (jd) deps.jdStore?.set(j.url, jd)
      return jd
    } catch { errors++; return '' }
  }, deps.signal)

  const byHash = new Map<string, string>()
  const fetched: FetchedJob[] = []
  unique.forEach((j, i) => {
    const jd = docs[i]
    if (jd === undefined) return // cancelled before this job started: stays pending, not failed
    if (!jd.trim()) { settled.push({ jobId: j.id, fate: 'failed', stage: 'fetch', reason: 'Job description unavailable', local: null, light: null }); return }
    const hash = jdHash(jd, j.location)
    const lead = byHash.get(hash)
    if (lead) { settled.push({ jobId: j.id, fate: 'skip', stage: 'fetch', reason: `Same description as ${lead}`, local: null, light: null, dupOf: lead }); return }
    byHash.set(hash, j.id)
    const hit = deps.cache.get(cacheKey(hash, deps.profileKey))
    if (hit) settled.push({ jobId: j.id, fate: 'light', stage: 'fetch', reason: 'Cached verdict', local: null, light: hit, cached: true })
    else fetched.push({ ...j, jd, jdHash: hash })
  })
  return { fetched, settled, errors }
}
