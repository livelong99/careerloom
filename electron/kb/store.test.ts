// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { makeItem } from './fixtures/golden'
import { kbJobDir } from './hash'
import { LIMITS } from './schema-guard'
import { openKbStore } from './store'
import type { KbManifest } from './types'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kb-store-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const manifest: KbManifest = { schema: 1, jobId: 'job-1', inputHash: 'h', researchedAt: 1, runner: 'r', model: null, costUsd: 0.1, searches: 2, pages: 3, status: 'complete', coverage: {} }

describe('kb store', () => {
  it('reads an empty KB for an unknown job, rejects bad job ids', () => {
    const s = openKbStore(() => dir)
    expect(s.read('job-1')).toEqual({ manifest: null, items: [], sources: [], skills: [], notes: { company: [], role: [], interviewerStyle: [], loop: [] } })
    expect(() => s.read('')).toThrow(/Invalid job id/)
  })
  it('round-trips through a fresh store (files at 0600, dirs 0700)', () => {
    const a = openKbStore(() => dir)
    const item = makeItem('How do you test a queue?')
    a.commit('job-1', { manifest, items: [item], notes: { company: ['c'], role: [], interviewerStyle: [], loop: [] } })
    const b = openKbStore(() => dir).read('job-1')
    expect(b.items).toEqual([item])
    expect(b.manifest).toEqual(manifest)
    expect(b.notes.company).toEqual(['c'])
    expect(statSync(join(dir, kbJobDir('job-1'), 'items.json')).mode & 0o777).toBe(0o600)
    expect(statSync(join(dir, kbJobDir('job-1'))).mode & 0o777).toBe(0o700)
  })
  it('merge-by-id keeps user.* and stats.* (and an edited item\'s own fields) when research re-finds an item', () => {
    const s = openKbStore(() => dir)
    const old = makeItem('How do you test a queue?', { confidence: 0.4 })
    s.commit('job-1', { items: [old, makeItem('Edited one'), makeItem('Plain one')] })
    s.updateItem('job-1', old.id, i => ({ ...i, user: { ...i.user, pinned: true, notes: 'mine' }, stats: { asked: 3, lastScore: 4, avgScore: 3.5 } }))
    const edited = makeItem('Edited one')
    s.updateItem('job-1', edited.id, i => ({ ...i, difficulty: 5, user: { ...i.user, edited: true } }))
    const out = s.commit('job-1', { items: [makeItem('How do you test a queue?', { confidence: 0.9, seen: 4 }), makeItem('Edited one', { difficulty: 1 }), makeItem('Brand new')] })
    const get = (t: string) => out.items.find(i => i.text === t)!
    expect(get('How do you test a queue?')).toMatchObject({ confidence: 0.9, seen: 4, user: { pinned: true, notes: 'mine' }, stats: { asked: 3, avgScore: 3.5 } })
    expect(get('Edited one').difficulty).toBe(5)
    expect(out.items.map(i => i.text)).toEqual(['How do you test a queue?', 'Edited one', 'Plain one', 'Brand new']) // nothing dropped, first-seen order
  })
  it('updateItem refuses a patch that changes the id, throws for a missing item', () => {
    const s = openKbStore(() => dir)
    const it0 = makeItem('Q one')
    s.commit('job-1', { items: [it0] })
    expect(() => s.updateItem('job-1', it0.id, i => ({ ...i, id: 'zzz' }))).toThrow(/id/)
    expect(() => s.updateItem('job-1', 'nope', i => i)).toThrow(/not found/)
  })
  it('never mutates data it handed out', () => {
    const s = openKbStore(() => dir)
    s.commit('job-1', { items: [makeItem('Q one')] })
    const before = s.read('job-1')
    s.commit('job-1', { items: [makeItem('Q two')] })
    expect(before.items).toHaveLength(1)
    expect(s.read('job-1').items).toHaveLength(2)
  })
  it('enforces ≤ maxItems keeping pinned/user/edited first, then confidence; clamps long text', () => {
    const s = openKbStore(() => dir)
    const many = Array.from({ length: LIMITS.items + 20 }, (_, i) => makeItem(`question number ${i}`, { confidence: i / 1000 }))
    const keep = makeItem('pinned low confidence', { confidence: 0, user: { pinned: true, hidden: false, edited: false, notes: null } })
    const out = s.commit('job-1', { items: [...many, keep, makeItem('x'.repeat(900))] })
    expect(out.items).toHaveLength(LIMITS.items)
    expect(out.items.some(i => i.id === keep.id)).toBe(true)
    expect(out.items.every(i => i.text.length <= LIMITS.text)).toBe(true)
    expect(out.items.some(i => i.text === 'question number 0')).toBe(false)
  })
  it('asserts the 8 MB per-job disk budget', () => {
    const s = openKbStore(() => dir)
    const fat = Array.from({ length: LIMITS.items }, (_, i) => makeItem(`fat ${i}`, { idealOutline: Array.from({ length: 12 }, () => 'x'.repeat(280)) }))
    expect(() => s.commit('job-1', { items: fat, sources: Array.from({ length: 30000 }, (_, i) => ({ id: `s${i}`, url: `https://e.dev/${'p'.repeat(300)}${i}`, title: 't'.repeat(200), host: 'e.dev', kind: 'other' as const, licence: null, fetchedAt: 1, contentHash: 'h'.repeat(64), trust: 1 as const })) })).toThrow(/budget/)
    expect(existsSync(join(dir, kbJobDir('job-1'), 'items.json'))).toBe(false) // nothing half-written
  })
  it('atomic write keeps the previous good file as .bak and leaves no temp file', () => {
    const s = openKbStore(() => dir)
    s.commit('job-1', { items: [makeItem('Q one')] })
    s.commit('job-1', { items: [makeItem('Q two')] })
    expect(readdirSync(join(dir, kbJobDir('job-1'))).sort()).toEqual(['items.json', 'items.json.bak'])
    expect(JSON.parse(readFileSync(join(dir, kbJobDir('job-1'), 'items.json.bak'), 'utf8'))).toHaveLength(1)
  })
  it('a corrupt file restores from .bak; with no .bak it loads as empty (never throws)', () => {
    const s = openKbStore(() => dir)
    s.commit('job-1', { items: [makeItem('Q one')] })
    s.commit('job-1', { items: [makeItem('Q two')] })
    writeFileSync(join(dir, kbJobDir('job-1'), 'items.json'), '{not json')
    expect(openKbStore(() => dir).read('job-1').items.map(i => i.text)).toEqual(['Q one'])
    rmSync(join(dir, kbJobDir('job-1'), 'items.json.bak'))
    writeFileSync(join(dir, kbJobDir('job-1'), 'items.json'), '[1,2,"x"]')
    expect(openKbStore(() => dir).read('job-1').items).toEqual([])
  })
  it('drops malformed rows but keeps valid ones; revision bumps on every write; remove deletes the folder', () => {
    const s = openKbStore(() => dir)
    s.commit('job-1', { items: [makeItem('Q one')] })
    const r0 = s.revision('job-1')
    writeFileSync(join(dir, kbJobDir('job-1'), 'items.json'), JSON.stringify([makeItem('Q ok'), { text: 5 }, null]))
    expect(openKbStore(() => dir).read('job-1').items.map(i => i.text)).toEqual(['Q ok'])
    s.commit('job-1', { notes: { company: ['n'], role: [], interviewerStyle: [], loop: [] } })
    expect(s.revision('job-1')).toBeGreaterThan(r0)
    s.remove('job-1')
    expect(existsSync(join(dir, kbJobDir('job-1')))).toBe(false)
    expect(s.read('job-1').items).toEqual([])
  })
})
