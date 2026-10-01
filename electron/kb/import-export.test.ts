// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { makeItem } from './fixtures/golden'
import { exportKb, importKb, IMPORT_MAX_BYTES } from './import-export'
import { openKbStore } from './store'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kb-ie-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))
const write = (name: string, body: string) => { const f = join(dir, name); writeFileSync(f, body); return f }

describe('kb export/import', () => {
  it('exports under <out>/ at 0600 without cv-derived hooks or user notes, and round-trips into another job', () => {
    const s = openKbStore(() => join(dir, 'kb'))
    s.commit('job-1', { items: [makeItem('Tell me about a launch', { hooks: { storyIds: ['s1'], gap: 'g', cvFacts: ['I run X at Acme'] }, user: { pinned: true, hidden: false, edited: false, notes: 'private' } })] })
    const file = exportKb(s, 'job-1', join(dir, 'exports'))
    expect(file.startsWith(join(dir, 'exports'))).toBe(true)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    const text = readFileSync(file, 'utf8')
    expect(text).not.toContain('Acme')
    expect(text).not.toContain('private')
    expect(importKb(s, 'job-2', file)).toEqual({ added: 1, skipped: 0 })
    expect(s.read('job-2').items[0]).toMatchObject({ text: 'Tell me about a launch', provenance: 'user', sources: [], user: { pinned: false } })
  })
  it('skips duplicates and invalid rows, counts them', () => {
    const s = openKbStore(() => join(dir, 'kb'))
    s.commit('job-1', { items: [makeItem('Existing question')] })
    const f = write('in.json', JSON.stringify({ format: 'careerloom-kb', version: 1, items: [{ text: 'Existing question' }, { text: 'New one', type: 'coding', difficulty: 2 }, { nope: 1 }, { text: 'New one' }] }))
    expect(importKb(s, 'job-1', f)).toEqual({ added: 1, skipped: 3 })
    expect(s.read('job-1').items.map(i => i.text)).toEqual(['Existing question', 'New one'])
  })
  it.each([
    ['not json', '{oops'],
    ['wrong shape', '[1,2]'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1, items: [] })],
    ['wrong version', JSON.stringify({ format: 'careerloom-kb', version: 9, items: [] })],
    ['items not an array', JSON.stringify({ format: 'careerloom-kb', version: 1, items: 'x' })],
    ['too many items', JSON.stringify({ format: 'careerloom-kb', version: 1, items: Array(1001).fill({ text: 'q' }) })],
  ])('rejects %s without touching the store', (_n, body) => {
    const s = openKbStore(() => join(dir, 'kb'))
    expect(() => importKb(s, 'job-1', write('bad.json', body))).toThrow()
    expect(s.read('job-1').items).toEqual([])
  })
  it('rejects oversized and missing files', () => {
    const s = openKbStore(() => join(dir, 'kb'))
    expect(() => importKb(s, 'job-1', write('big.json', ' '.repeat(IMPORT_MAX_BYTES + 1)))).toThrow(/too large/)
    expect(() => importKb(s, 'job-1', join(dir, 'missing.json'))).toThrow()
  })
})
