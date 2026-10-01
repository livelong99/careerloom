// Normalise + shingle Jaccard ≥ .8 merge with a `seen` count (plan §3.2 step 6). Ids are sha1(normalised text) so a refresh merges stably.
import { createHash } from 'node:crypto'

import type { KbItem } from '../types'

/** Keeps `c++`, `c#`, `node.js`; drops sentence punctuation (a trailing `.` is not part of a word). */
export const normalise = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, ' ').replace(/(^|\s)\.+|\.+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
/** Same recipe as hash.ts `itemId` (WP1). */
export const itemId = (text: string): string => createHash('sha1').update(normalise(text)).digest('hex')

const shingles = (text: string): Set<string> => {
  const w = normalise(text).split(' ').filter(Boolean)
  const n = w.length >= 3 ? 3 : 1
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '))
  return out
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

export const SIMILAR = 0.8

/** Order-stable: the first item of a cluster survives (it gains the union of skills/sources); `seen` counts distinct sources. */
export function dedupe(items: KbItem[]): KbItem[] {
  const kept: Array<{ item: KbItem; sh: Set<string> }> = []
  for (const item of items) {
    const sh = shingles(item.text)
    const twin = kept.find(k => k.item.id === item.id || jaccard(k.sh, sh) >= SIMILAR)
    if (!twin) { kept.push({ item: { ...item, sources: [...item.sources], skills: [...item.skills] }, sh }); continue }
    const t = twin.item
    const have = new Set(t.sources.map(s => s.sourceId))
    const sources = [...t.sources, ...item.sources.filter(s => !have.has(s.sourceId))]
    twin.item = { ...t, sources, skills: [...new Set([...t.skills, ...item.skills])], seen: Math.max(sources.length, t.seen) }
  }
  return kept.map(k => k.item)
}
