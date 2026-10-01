// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createKbApi } from './api'
import { makeItem } from './research/item'
import { openKbStore } from './store'
import type { KbManifest, SkillNode } from './types'

const JOB = 'https://jobs.example.com/roles/42?ref=abc' // job ids are URLs
let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kb-api-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const skill = (id: string, o: Partial<SkillNode> = {}): SkillNode => ({ id, name: id, family: null, origin: 'jd', expected: 'working', weight: 0.8, inCv: true, ...o })
const manifest = (o: Partial<KbManifest> = {}): KbManifest => ({ schema: 1, jobId: JOB, inputHash: 'h1', researchedAt: 1_000, runner: 'r', model: null, costUsd: 0.12, searches: 2, pages: 3, status: 'complete', coverage: {}, ...o })
const q = (text: string, o: Parameters<typeof makeItem>[0] extends infer T ? Partial<T> : never = {}) => makeItem({ text, type: 'technical', skills: ['react'], difficulty: 3, provenance: 'sourced', sources: [{ sourceId: 's1', note: 'n' }], trust: 1, ...o })

function setup(research: Partial<ReturnType<Parameters<typeof createKbApi>[0]['research']>> = {}) {
  const store = openKbStore(() => dir)
  const changed = vi.fn()
  const api = createKbApi({
    store: () => store, changed, exportDir: () => join(dir, 'exports'), refreshAfterDays: () => 30, now: () => 2_000,
    research: () => ({ running: () => null, progress: () => null, inputHash: () => 'h1', ...research }),
  })
  return { store, api, changed }
}

describe('kbSummary', () => {
  it('is none for an unresearched job and complete once a manifest lands', () => {
    const { store, api } = setup()
    expect(api.kbSummary(JOB)).toMatchObject({ status: 'none', items: 0, sourcedPct: 0, runId: null })
    store.commit(JOB, { manifest: manifest(), items: [q('What is a closure in JavaScript?'), q('Explain how React reconciles?', { provenance: 'generated', sources: [] })], skills: [skill('react')], sources: [{ id: 's1', url: 'https://a.dev/x', title: 't', host: 'a.dev', kind: 'official-doc', licence: null, fetchedAt: 1, contentHash: 'c', trust: 2 }] })
    expect(api.kbSummary(JOB)).toMatchObject({ status: 'complete', items: 2, sourcedPct: 50, sources: 1, costUsd: 0.12, inputChanged: false, researchedAt: 1_000 })
    expect(api.kbSummary(JOB).coverage[0]).toMatchObject({ skillId: 'react', have: 2 })
  })
  it('is stale when the posting changed or the base is old, running (with progress) during a run', () => {
    const { store, api } = setup({ inputHash: () => 'h2' })
    store.commit(JOB, { manifest: manifest(), items: [q('What is a closure in JavaScript?')] })
    expect(api.kbSummary(JOB)).toMatchObject({ status: 'stale', inputChanged: true })
    const progress = { runId: 'r1', phase: 'fetch', done: 2, total: 9, spentUsd: 0.01, elapsedMs: 5, pages: 2, itemsFound: 3, skipped: 0 } as const
    const run = setup({ running: () => 'r1', progress: () => progress })
    expect(run.api.kbSummary(JOB)).toMatchObject({ status: 'running', runId: 'r1', progress })
    const old = createKbApi({ store: () => store, changed: vi.fn(), exportDir: () => dir, refreshAfterDays: () => 30, now: () => 40 * 86_400_000, research: () => ({ running: () => null, progress: () => null, inputHash: () => 'h1' }) })
    expect(old.kbSummary(JOB).status).toBe('stale')
  })
})

describe('kbList / kbItem', () => {
  it('hides hidden items unless asked, and filters', () => {
    const { store, api } = setup()
    const a = q('What is a closure in JavaScript?'); const b = q('Design a rate limiter for an API.', { type: 'system-design', skills: ['api'], provenance: 'generated', sources: [] })
    store.commit(JOB, { items: [a, b], skills: [skill('react', { inCv: false })] })
    api.kbItemUpdate(JOB, a.id, { hidden: true })
    expect(api.kbList(JOB).map(i => i.id)).toEqual([b.id])
    expect(api.kbList(JOB, { hidden: true }).map(i => i.id).sort()).toEqual([a.id, b.id].sort())
    expect(api.kbList(JOB, { hidden: true, types: ['system-design'] }).map(i => i.id)).toEqual([b.id])
    expect(api.kbList(JOB, { hidden: true, provenance: ['sourced'] }).map(i => i.id)).toEqual([a.id])
    expect(api.kbList(JOB, { text: 'rate limiter' }).map(i => i.id)).toEqual([b.id])
    expect(JSON.stringify(api.kbList(JOB))).not.toContain('cvFacts') // views never carry hooks
  })
  it('kbItem resolves sources and a why-for-you line, and rejects unknown ids', () => {
    const { store, api } = setup()
    const a = { ...q('What is a closure in JavaScript?'), hooks: { storyIds: [], gap: null, cvFacts: ['Built a React design system'] } }
    store.commit(JOB, { items: [a], skills: [skill('react', { inCv: false })], sources: [{ id: 's1', url: 'https://a.dev/x', title: 't', host: 'a.dev', kind: 'eng-blog', licence: null, fetchedAt: 1, contentHash: 'c', trust: 1 }] })
    const d = api.kbItem(JOB, a.id)
    expect(d.sources[0]).toMatchObject({ note: 'n', source: { url: 'https://a.dev/x' } })
    expect(d.whyForYou).toMatch(/react/)
    expect(() => api.kbItem(JOB, 'nope')).toThrow(/no longer/)
    expect(() => api.kbSummary('')).toThrow(/not valid/)
  })
})

describe('edits', () => {
  it('pin/notes keep the item unedited; content edits mark it edited and keep the id', () => {
    const { store, api, changed } = setup()
    const a = q('What is a closure in JavaScript?')
    store.commit(JOB, { items: [a] })
    expect(api.kbItemUpdate(JOB, a.id, { pinned: true, notes: 'ask about GC' })).toMatchObject({ id: a.id, user: { pinned: true, edited: false, notes: 'ask about GC' } })
    const edited = api.kbItemUpdate(JOB, a.id, { text: 'What is a closure, and when does it leak?', difficulty: 4 })
    expect(edited).toMatchObject({ id: a.id, text: 'What is a closure, and when does it leak?', difficulty: 4, user: { edited: true, pinned: true } })
    expect(changed).toHaveBeenCalledWith(JOB)
    expect(() => api.kbItemUpdate(JOB, a.id, { text: '   ' })).toThrow(/text/)
  })
  it('add makes a user item once; remove deletes user items and hides researched ones', () => {
    const { store, api } = setup()
    const added = api.kbItemAdd(JOB, { text: 'Tell me about a time you disagreed with a lead.', type: 'behavioural', skills: [], difficulty: 2 })
    expect(added).toMatchObject({ provenance: 'user', confidence: 1 })
    expect(() => api.kbItemAdd(JOB, { text: 'tell me about a time you disagreed with a lead', type: 'behavioural', skills: [], difficulty: 2 })).toThrow(/already/)
    const r = q('What is a closure in JavaScript?'); store.commit(JOB, { items: [r] })
    api.kbItemRemove(JOB, added.id); api.kbItemRemove(JOB, r.id)
    expect(store.read(JOB).items.map(i => [i.id, i.user.hidden])).toEqual([[r.id, true]])
    expect(() => api.kbItemRemove(JOB, 'nope')).toThrow(/no longer/)
  })
  it('export then import into another job round-trips as user items', () => {
    const { store, api } = setup()
    store.commit(JOB, { items: [q('What is a closure in JavaScript?'), q('Explain event delegation in the DOM?')] })
    const file = api.kbExport(JOB)
    expect(JSON.parse(readFileSync(file, 'utf8')).items).toHaveLength(2)
    expect(api.kbImport('other-job', file)).toEqual({ added: 2, skipped: 0 })
    expect(store.read('other-job').items.every(i => i.provenance === 'user')).toBe(true)
    expect(api.kbImport('other-job', file)).toEqual({ added: 0, skipped: 2 })
  })
})
