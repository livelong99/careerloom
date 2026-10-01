// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { golden40, goldenSkills, makeItem } from './fixtures/golden'
import { bindKbStore, kbPrefix, retrieve, selectionPool } from './retrieve'
import { openKbStore, type KbStore } from './store'

let dir = ''
let store: KbStore
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kb-ret-')); store = openKbStore(() => dir); bindKbStore(store) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const load = (items = golden40().map(g => g.item)) => store.commit('job-1', { items, skills: goldenSkills(), notes: { company: ['Acme builds payment rails.'], role: ['Backend, on call 1 in 6.'], interviewerStyle: ['Probes for numbers.'], loop: ['Phone, onsite, bar raiser.'] } })

describe('retrieve', () => {
  it('returns [] for an empty KB, blank query or unknown job; k defaults to 3', () => {
    expect(retrieve('nope', 'kafka')).toEqual([])
    load()
    expect(retrieve('job-1', '   ')).toEqual([])
    expect(retrieve('job-1', 'tell me about a time')).toHaveLength(3)
  })
  it('excludes hidden items and prefers pinned ones on a tie', () => {
    const [a, b] = [makeItem('Describe our cache design', { confidence: 0.5 }), makeItem('Describe your cache design', { confidence: 0.5 })]
    load([a, { ...b, user: { ...b.user, pinned: true } }])
    expect(retrieve('job-1', 'describe cache design', { k: 2 })[0]!.id).toBe(b.id)
    store.updateItem('job-1', a.id, i => ({ ...i, user: { ...i.user, hidden: true } }))
    expect(retrieve('job-1', 'describe cache design', { k: 2 }).map(i => i.id)).toEqual([b.id])
  })
  it('a type hint prefers that type; a skill named in the question boosts items that carry it', () => {
    const t = makeItem('How do you handle failure in the pipeline?', { type: 'technical' })
    const bq = makeItem('How do you handle failure in the pipeline?  Tell a story.', { type: 'behavioural' })
    load([t, bq])
    expect(retrieve('job-1', 'handle failure in the pipeline', { type: 'behavioural', k: 2 })[0]!.id).toBe(bq.id)
    const k = makeItem('Explain ordering guarantees', { skills: ['kafka'] })
    const n = makeItem('Explain ordering guarantees', { skills: [], text: 'Explain ordering guarantees please' })
    load([n, k])
    expect(retrieve('job-1', 'explain ordering guarantees in kafka', { k: 2 })[0]!.id).toBe(k.id)
  })
  it('sees edits immediately (index invalidated by revision)', () => {
    load()
    expect(retrieve('job-1', 'brand new zebra question')[0]?.text).not.toBe('Zebra question about stripes')
    store.commit('job-1', { items: [makeItem('Zebra question about stripes')] })
    expect(retrieve('job-1', 'zebra stripes')[0]!.text).toBe('Zebra question about stripes')
  })
  it('selectionPool = everything not hidden, in stored order', () => {
    const items = golden40().map(g => g.item)
    load([{ ...items[0]!, user: { ...items[0]!.user, hidden: true } }, ...items.slice(1)])
    expect(selectionPool('job-1')).toHaveLength(39)
    expect(selectionPool('job-1')[0]!.id).toBe(items[1]!.id)
    expect(selectionPool('nope')).toEqual([])
  })
})

describe('kbPrefix', () => {
  it('is a deterministic, byte-stable ## QUESTION BASE block ≤ 700 tokens with skills, 8 items and 3 notes', () => {
    load()
    const a = kbPrefix('job-1')
    expect(kbPrefix('job-1')).toBe(a)
    expect(a.startsWith('## QUESTION BASE')).toBe(true)
    expect(Math.ceil(a.length / 4)).toBeLessThanOrEqual(700)
    expect(a).toContain('Kafka')
    expect(a.split('\n').filter(l => l.startsWith('- Q:'))).toHaveLength(8)
    expect(a).toContain('Acme builds payment rails.')
  })
  it('stays within a small budget (trimmed from the end), pinned items first, hidden never; empty KB → ""', () => {
    const items = golden40().map(g => g.item)
    load(items.map((i, n) => (n === 39 ? { ...i, user: { ...i.user, pinned: true } } : n === 38 ? { ...i, user: { ...i.user, hidden: true }, confidence: 1 } : i)))
    const full = kbPrefix('job-1')
    expect(full).toContain(items[39]!.text)
    expect(full).not.toContain(items[38]!.text)
    const small = kbPrefix('job-1', 120)
    expect(Math.ceil(small.length / 4)).toBeLessThanOrEqual(120)
    expect(full.startsWith(small.split('\n').slice(0, 2).join('\n'))).toBe(true)
    expect(kbPrefix('nope')).toBe('')
  })
  it('never contains cv facts (hooks)', () => {
    load([makeItem('Question with hooks', { hooks: { storyIds: [], gap: null, cvFacts: ['SECRET-CV-FACT'] } })])
    expect(kbPrefix('job-1')).not.toContain('SECRET-CV-FACT')
  })
})
