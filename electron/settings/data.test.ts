// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearDir, dirStats, pruneOlderThan } from './data'

let dir = ''
const DAY = 86_400_000
const put = (name: string, bytes: number, ageDays = 0) => {
  const f = path.join(dir, name)
  fs.writeFileSync(f, 'x'.repeat(bytes))
  const t = new Date(Date.now() - ageDays * DAY)
  fs.utimesSync(f, t, t)
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('data helpers', () => {
  it('dirStats counts only the extension; missing dir is zero', () => {
    put('a.log', 10); put('b.log', 5); put('c.txt', 99)
    expect(dirStats(dir, '.log')).toEqual({ files: 2, bytes: 15 })
    expect(dirStats(path.join(dir, 'nope'), '.log')).toEqual({ files: 0, bytes: 0 })
  })
  it('prune removes only logs older than N days', () => {
    put('old.log', 10, 40); put('new.log', 5, 2); put('old.txt', 1, 90)
    expect(pruneOlderThan(dir, '.log', 30)).toEqual({ removedFiles: 1, freedBytes: 10 })
    expect(fs.readdirSync(dir).sort()).toEqual(['new.log', 'old.txt'])
  })
  it('prune with null (forever) deletes nothing', () => {
    put('old.log', 10, 400)
    expect(pruneOlderThan(dir, '.log', null)).toEqual({ removedFiles: 0, freedBytes: 0 })
    expect(fs.existsSync(path.join(dir, 'old.log'))).toBe(true)
  })
  it('clearDir removes every file of that extension and reports it', () => {
    put('a.json', 3); put('b.json', 4); put('keep.log', 1)
    expect(clearDir(dir, '.json')).toEqual({ removedFiles: 2, freedBytes: 7 })
    expect(fs.readdirSync(dir)).toEqual(['keep.log'])
  })
})
