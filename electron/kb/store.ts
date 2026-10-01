// Per-job folder of JSON under userData/kb (plan §5): atomic writes, merge-by-id, bounded, never throws on a corrupt file.
// ponytail: every operation is synchronous, so Node's single thread already serialises research commits and user edits;
// add a real mutex only if a write ever becomes async.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { kbJobDir } from './hash'
import { LIMITS, parseItems, parseManifest, parseNotes, parseSkills, parseSources } from './schema-guard'
import type { KbItem, KbManifest, KbNotes, SkillNode, SourceRef } from './types'

export type KbData = { manifest: KbManifest | null; items: KbItem[]; sources: SourceRef[]; skills: SkillNode[]; notes: KbNotes }
export interface KbStore {
  /** Cached and shared: callers must treat the result as read-only (commit/updateItem always build new objects). */
  read(jobId: string): KbData
  /** Merges by `item.id`, preserving `user.*` and `stats.*`; atomic. Items/sources/skills merge, manifest/notes replace. */
  commit(jobId: string, data: Partial<KbData>): KbData
  updateItem(jobId: string, itemId: string, patch: (item: KbItem) => KbItem): KbItem
  /** Deletes one item (user items only by contract; the caller decides). */
  removeItem(jobId: string, itemId: string): void
  remove(jobId: string): void
  /** A source by id across all jobs (kbOpenSource has only the id). */
  findSource(sourceId: string): SourceRef | null
  /** Bumps on every write to the job (in-process): index caches key on it. */
  revision(jobId: string): number
}

const checkId = (id: string): string => { if (typeof id !== 'string' || id.trim() === '' || id.length > 2000) throw new Error('Invalid job id'); return id }
const EMPTY_NOTES: KbNotes = { company: [], role: [], interviewerStyle: [], loop: [] }
const FILES = ['manifest', 'items', 'sources', 'skills', 'notes'] as const

const readJson = (file: string): unknown => {
  for (const f of [file, `${file}.bak`]) {
    try { return JSON.parse(readFileSync(f, 'utf8')) } catch { /* corrupt or missing: try the last good copy */ }
  }
  return undefined
}
const merge = <T extends { id: string }>(old: T[], next: T[], keep: (o: T, n: T) => T): T[] => {
  const byId = new Map(old.map(o => [o.id, o]))
  const out = new Map(old.map(o => [o.id, o]))
  for (const n of next) { const o = byId.get(n.id); out.set(n.id, o ? keep(o, n) : n) }
  return [...out.values()]
}
/** Research re-finds an item: refresh the facts, keep what the user and the practice runs wrote. A user-edited item keeps its own fields. */
const mergeItem = (o: KbItem, n: KbItem): KbItem => ({ ...(o.user.edited ? { ...n, text: o.text, type: o.type, skills: o.skills, difficulty: o.difficulty } : n), id: o.id, user: o.user, stats: o.stats })
const priority = (i: KbItem): number => (i.user.pinned || i.user.edited || i.provenance === 'user' ? 1 : 0)
const capItems = (items: KbItem[]): KbItem[] => {
  if (items.length <= LIMITS.items) return items
  const drop = new Set([...items].sort((a, b) => priority(a) - priority(b) || a.confidence - b.confidence).slice(0, items.length - LIMITS.items).map(i => i.id))
  return items.filter(i => !drop.has(i.id))
}

export function openKbStore(dir: () => string): KbStore {
  const cache = new Map<string, KbData>()
  const revs = new Map<string, number>()
  const bump = (jobId: string): void => { revs.set(jobId, (revs.get(jobId) ?? 0) + 1) }
  const jobDir = (jobId: string): string => join(dir(), kbJobDir(checkId(jobId)))

  const load = (jobId: string): KbData => {
    const d = jobDir(jobId)
    const f = (name: string): unknown => readJson(join(d, `${name}.json`))
    return { manifest: parseManifest(f('manifest')), items: parseItems(f('items')), sources: parseSources(f('sources')), skills: parseSkills(f('skills')), notes: f('notes') === undefined ? EMPTY_NOTES : parseNotes(f('notes')) }
  }
  const read = (jobId: string): KbData => {
    checkId(jobId)
    const hit = cache.get(jobId)
    if (hit) return hit
    const data = load(jobId)
    cache.set(jobId, data)
    return data
  }
  const write = (jobId: string, next: KbData, only: readonly (typeof FILES[number])[]): void => {
    const d = jobDir(jobId)
    const body = { manifest: next.manifest, items: next.items, sources: next.sources, skills: next.skills, notes: next.notes }
    const text = FILES.map(n => [n, JSON.stringify(body[n])] as const)
    if (text.reduce((s, [, t]) => s + Buffer.byteLength(t), 0) > LIMITS.jobBytes) throw new Error('Knowledge base over its 8 MB budget')
    mkdirSync(d, { recursive: true, mode: 0o700 })
    chmodSync(d, 0o700)
    for (const [name, t] of text) {
      if (!only.includes(name) || (name === 'manifest' && next.manifest === null)) continue
      const file = join(d, `${name}.json`)
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, t, { mode: 0o600 })
      if (existsSync(file)) copyFileSync(file, `${file}.bak`)
      renameSync(tmp, file)
    }
  }
  const save = (jobId: string, next: KbData, only: readonly (typeof FILES[number])[] = FILES): KbData => { write(jobId, next, only); cache.set(jobId, next); bump(jobId); return next }

  return {
    read,
    commit(jobId, data) {
      const cur = read(jobId)
      return save(jobId, {
        manifest: data.manifest !== undefined ? data.manifest : cur.manifest,
        items: data.items ? capItems(merge(cur.items, parseItems(data.items), mergeItem)) : cur.items,
        sources: data.sources ? merge(cur.sources, parseSources(data.sources), (_o, n) => n) : cur.sources,
        skills: data.skills ? merge(cur.skills, parseSkills(data.skills), (_o, n) => n) : cur.skills,
        notes: data.notes ? parseNotes(data.notes) : cur.notes,
      }, FILES.filter(n => data[n] !== undefined))
    },
    updateItem(jobId, itemId, patch) {
      const cur = read(jobId)
      const old = cur.items.find(i => i.id === itemId)
      if (!old) throw new Error('Item not found')
      const next = patch(old)
      if (next.id !== itemId) throw new Error('An item id cannot change')
      save(jobId, { ...cur, items: cur.items.map(i => (i.id === itemId ? next : i)) }, ['items'])
      return next
    },
    removeItem(jobId, itemId) {
      const cur = read(jobId)
      if (!cur.items.some(i => i.id === itemId)) throw new Error('Item not found')
      save(jobId, { ...cur, items: cur.items.filter(i => i.id !== itemId) }, ['items'])
    },
    findSource(sourceId) {
      let names: string[] = []
      try { names = readdirSync(dir()) } catch { return null }
      for (const n of names) {
        const hit = parseSources(readJson(join(dir(), n, 'sources.json'))).find(x => x.id === sourceId)
        if (hit) return hit
      }
      return null
    },
    remove(jobId) { rmSync(jobDir(jobId), { recursive: true, force: true }); cache.delete(jobId); bump(jobId) },
    revision: jobId => revs.get(jobId) ?? 0,
  }
}
