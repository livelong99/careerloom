// Data & privacy helpers: sizes, clearing and age-based pruning of app-owned files. Pure over a directory
// so they are testable; handlers pass the real userData paths. Only files with the given extension are touched.
import fs from 'node:fs'
import path from 'node:path'

import type { PruneResult } from './types'

const DAY_MS = 86_400_000

function entries(dir: string, ext: string): Array<{ file: string; size: number; mtimeMs: number }> {
  try {
    return fs.readdirSync(dir).flatMap(name => {
      if (!name.endsWith(ext)) return []
      const file = path.join(dir, name)
      try { const st = fs.statSync(file); return st.isFile() ? [{ file, size: st.size, mtimeMs: st.mtimeMs }] : [] } catch { return [] }
    })
  } catch { return [] }
}

export function dirStats(dir: string, ext: string): { files: number; bytes: number } {
  const all = entries(dir, ext)
  return { files: all.length, bytes: all.reduce((n, e) => n + e.size, 0) }
}

function remove(list: Array<{ file: string; size: number }>): PruneResult {
  let removedFiles = 0
  let freedBytes = 0
  for (const e of list) {
    try { fs.rmSync(e.file); removedFiles += 1; freedBytes += e.size } catch { /* in use or already gone */ }
  }
  return { removedFiles, freedBytes }
}

export const clearDir = (dir: string, ext: string): PruneResult => remove(entries(dir, ext))

/** Removes files older than `days` (null = keep forever → nothing). */
export function pruneOlderThan(dir: string, ext: string, days: number | null, now = Date.now()): PruneResult {
  if (days === null) return { removedFiles: 0, freedBytes: 0 }
  return remove(entries(dir, ext).filter(e => now - e.mtimeMs > days * DAY_MS))
}
