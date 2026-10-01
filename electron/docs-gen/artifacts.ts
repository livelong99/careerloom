// data/careerloom-artifacts.json: what Careerloom generated per job, so the Documents tab can list it.
// Files live in output/careerloom/<reportNum|jobHash>-<slug>/ : unique per job, never the master cv.md.
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { Artifact } from './types'

const INDEX = join('data', 'careerloom-artifacts.json')
const BASE = join('output', 'careerloom')
export const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

export function readIndex(root: string): Artifact[] {
  try {
    const raw = JSON.parse(readFileSync(join(root, INDEX), 'utf8')) as { artifacts?: unknown }
    return Array.isArray(raw.artifacts) ? (raw.artifacts as Artifact[]) : []
  } catch { return [] }
}

/** One artifact per (job, kind): generating again replaces that entry and its files, never another job's. */
export function saveArtifact(root: string, a: Artifact): void {
  const next = [...readIndex(root).filter(x => !(x.jobId === a.jobId && x.kind === a.kind)), a]
  const file = join(root, INDEX)
  mkdirSync(join(root, 'data'), { recursive: true })
  const tmp = `${file}.${randomUUID().slice(0, 6)}.tmp`
  writeFileSync(tmp, JSON.stringify({ version: 1, artifacts: next }, null, 2))
  renameSync(tmp, file)
}

/** Listed artifacts whose files still exist. */
export const listFor = (root: string, jobId: string): Artifact[] =>
  readIndex(root).filter(a => a.jobId === jobId && existsSync(join(root, a.files.md))).sort((x, y) => y.createdAt - x.createdAt)

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job'
/** Relative folder for a job: the report number when it has one, else a hash of its id (unique per job). */
export const jobDir = (job: { id: string; reportNum: number | null; company: string; title: string }): string =>
  join(BASE, `${job.reportNum !== null ? String(job.reportNum).padStart(3, '0') : sha(job.id).slice(0, 8)}-${slug(`${job.company} ${job.title}`)}`)

/** Resolve a path from the renderer: only inside output/careerloom of the career-ops folder. */
export function safeArtifactPath(root: string, rel: unknown): string {
  if (typeof rel !== 'string' || !rel) throw new Error('Missing file path')
  const base = resolve(root, BASE)
  const full = resolve(root, rel)
  if (full !== base && !full.startsWith(base + sep)) throw new Error('That file is not one Careerloom generated')
  return full
}
