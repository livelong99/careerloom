// Export/import of a job's question base as one small JSON file (plan §4). Import is a trust boundary: size cap, shape check, per-row guard.
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseItem } from './schema-guard'
import type { KbStore } from './store'

const FORMAT = 'careerloom-kb'
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024
const IMPORT_MAX_ITEMS = 1000

/** Writes `<outDir>/kb-<jobId>.json` (0600). Sources, cv hooks, notes and stats stay behind: a shared file never carries personal context. */
export function exportKb(store: KbStore, jobId: string, outDir: string): string {
  const items = store.read(jobId).items.map(i => ({ text: i.text, type: i.type, skills: i.skills, difficulty: i.difficulty, idealOutline: i.idealOutline, followUps: i.followUps, rubric: i.rubric, redFlags: i.redFlags }))
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  const file = join(outDir, `kb-${jobId}.json`)
  writeFileSync(file, JSON.stringify({ format: FORMAT, version: 1, items }, null, 1), { mode: 0o600 })
  chmodSync(file, 0o600)
  return file
}

/** Imported rows become the user's own items (no sources, unpinned): duplicates by id and invalid rows are skipped and counted. Throws before touching the store on a bad file. */
export function importKb(store: KbStore, jobId: string, file: string): { added: number; skipped: number } {
  if (statSync(file).size > IMPORT_MAX_BYTES) throw new Error('Import file too large (max 2 MB)')
  let doc: unknown
  try { doc = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('Import file is not valid JSON') }
  const d = doc as { format?: unknown; version?: unknown; items?: unknown }
  if (!d || typeof d !== 'object' || d.format !== FORMAT || d.version !== 1 || !Array.isArray(d.items)) throw new Error('Not a Careerloom question base file')
  if (d.items.length > IMPORT_MAX_ITEMS) throw new Error(`Import has too many items (max ${IMPORT_MAX_ITEMS})`)
  const have = new Set(store.read(jobId).items.map(i => i.id))
  const fresh = []
  for (const raw of d.items) {
    const item = parseItem(raw)
    if (!item || have.has(item.id)) continue
    have.add(item.id)
    fresh.push({ ...item, provenance: 'user' as const, sources: [], seen: 1, hooks: { storyIds: [], gap: null, cvFacts: [] }, user: { pinned: false, hidden: false, edited: false, notes: null }, stats: { asked: 0, lastScore: null, avgScore: null } })
  }
  if (fresh.length) store.commit(jobId, { items: fresh })
  return { added: fresh.length, skipped: d.items.length - fresh.length }
}
