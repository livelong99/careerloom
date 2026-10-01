// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { golden400, golden40, goldenSkills, labelled } from './fixtures/golden'
import { bindKbStore, kbPrefix, retrieve } from './retrieve'
import { openKbStore } from './store'

// Thresholds from plan §11 WP1 (proposed; adjust at G-R): recall@3 ≥ 0.85, MRR ≥ 0.7 on the 60 labelled pairs, over the 400-item KB.
const dir = mkdtempSync(join(tmpdir(), 'kb-rel-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('relevance eval (60 labelled pairs, 400 items)', () => {
  const store = openKbStore(() => dir)
  bindKbStore(store)
  store.commit('job-1', { items: golden400(), skills: goldenSkills() })
  const ids = new Map(golden40().map(g => [g.key, g.item.id]))
  const pairs = labelled()
  const ranks = pairs.map(p => retrieve('job-1', p.query, { k: 10 }).findIndex(i => i.id === ids.get(p.key)))

  it('has exactly 60 pairs, all pointing at real items', () => {
    expect(pairs).toHaveLength(60)
    expect(pairs.every(p => ids.has(p.key))).toBe(true)
  })
  it('recall@3 ≥ 0.85', () => {
    const recall = ranks.filter(r => r >= 0 && r < 3).length / ranks.length
    console.info(`recall@3 = ${recall.toFixed(3)}`)
    expect(recall).toBeGreaterThanOrEqual(0.85)
  })
  it('MRR ≥ 0.7', () => {
    const mrr = ranks.reduce((s, r) => s + (r >= 0 ? 1 / (r + 1) : 0), 0) / ranks.length
    console.info(`MRR = ${mrr.toFixed(3)}`)
    expect(mrr).toBeGreaterThanOrEqual(0.7)
  })
  it('kbPrefix on 400 items is ≤ 700 tokens and byte-stable; retrieval p95 is far under the 50 ms ceiling (5 ms target: scripts/kb-latency.mjs)', () => {
    const a = kbPrefix('job-1')
    expect(Math.ceil(a.length / 4)).toBeLessThanOrEqual(700)
    expect(kbPrefix('job-1')).toBe(a)
    const ms = pairs.map(p => { const t = performance.now(); retrieve('job-1', p.query); return performance.now() - t }).sort((x, y) => x - y)
    expect(ms[Math.ceil(ms.length * 0.95) - 1]).toBeLessThan(50)
  })
})
