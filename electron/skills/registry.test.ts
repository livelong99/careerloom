import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRegistry } from './registry'
import type { SkillSource } from './types'

const FIXTURES = path.join(__dirname, '__fixtures__')
const example: SkillSource = { kind: 'folder', path: path.join(FIXTURES, 'example-skill') }
const scripted: SkillSource = { kind: 'folder', path: path.join(FIXTURES, 'scripted-skill') }
let base: string
beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-reg-')) })
afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

describe('registry', () => {
  it('installs a copy, records it, defaults to enabled', async () => {
    const reg = createRegistry(base)
    const s = await reg.install(example)
    expect(s).toMatchObject({ id: 'example-cover-notes', enabled: true, hasScripts: false, version: '1.2.0', path: path.join(base, 'skills', 'example-cover-notes') })
    expect(fs.readFileSync(path.join(s.path, 'references', 'proof-points.md'), 'utf8')).toContain('p95')
    expect(createRegistry(base).list().map(k => k.id)).toEqual(['example-cover-notes']) // persisted
    expect(JSON.parse(fs.readFileSync(path.join(base, 'skills.json'), 'utf8')).version).toBe(1)
    expect(fs.readdirSync(base).filter(f => f.endsWith('.tmp'))).toEqual([])
  })

  it('refuses scripts without consent, installs with it', async () => {
    const reg = createRegistry(base)
    await expect(reg.install(scripted)).rejects.toMatchObject({ code: 'consent' })
    expect(reg.list()).toEqual([])
    expect(fs.existsSync(path.join(base, 'skills', 'scripted-skill'))).toBe(false)
    const s = await reg.install(scripted, { confirmedScripts: true })
    expect(s.hasScripts).toBe(true)
    expect(fs.statSync(path.join(s.path, 'scripts', 'hello.sh')).isFile()).toBe(true)
  })

  it('toggles and removes', async () => {
    const reg = createRegistry(base)
    const { id, path: dir } = await reg.install(example)
    expect(reg.setEnabled(id, false).enabled).toBe(false)
    expect(reg.enabled()).toEqual([])
    expect(reg.setEnabled(id, true).enabled).toBe(true)
    expect(reg.enabled()).toHaveLength(1)
    reg.remove(id)
    expect(reg.list()).toEqual([])
    expect(fs.existsSync(dir)).toBe(false)
    expect(() => reg.remove(id)).toThrow(/No installed skill/)
    expect(() => reg.setEnabled('../x', true)).toThrow(/No installed skill/)
  })

  it('update previews the same source and reports a replacement; install applies and keeps the enabled flag', async () => {
    const src = path.join(base, 'src'); fs.cpSync(example.kind === 'folder' ? example.path : '', src, { recursive: true })
    const reg = createRegistry(base)
    const first = await reg.install({ kind: 'folder', path: src })
    reg.setEnabled(first.id, false)
    const same = await reg.update(first.id)
    expect(same).toMatchObject({ replaces: true, hash: first.hash })

    fs.appendFileSync(path.join(src, 'SKILL.md'), '\nMore.\n')
    const changed = await reg.update(first.id)
    expect(changed.hash).not.toBe(first.hash)
    expect(reg.list()[0]!.hash).toBe(first.hash) // preview alone changes nothing
    const applied = await reg.install(changed.source)
    expect(applied.hash).toBe(changed.hash)
    expect(applied.enabled).toBe(false)
    expect(fs.readFileSync(path.join(applied.path, 'SKILL.md'), 'utf8')).toContain('More.')
    expect(fs.existsSync(`${applied.path}.old`)).toBe(false)
  })

  it('ignores a corrupt registry file and never trusts stored paths', async () => {
    fs.writeFileSync(path.join(base, 'skills.json'), '{nope')
    expect(createRegistry(base).list()).toEqual([])
    fs.writeFileSync(path.join(base, 'skills.json'), JSON.stringify({ version: 1, skills: [{ id: 'ok', path: '/etc', enabled: true }, { id: '../bad' }] }))
    expect(createRegistry(base).list()).toEqual([expect.objectContaining({ id: 'ok', path: path.join(base, 'skills', 'ok') })])
  })

  it('never overwrites a folder it does not own (Integrations clones share the parent)', async () => {
    const theirs = path.join(base, 'skills', 'example-cover-notes'); fs.mkdirSync(theirs, { recursive: true }); fs.writeFileSync(path.join(theirs, 'keep.txt'), 'x')
    await expect(createRegistry(base).install(example)).rejects.toThrow(/already exists/)
    expect(fs.readFileSync(path.join(theirs, 'keep.txt'), 'utf8')).toBe('x')
  })

  it('a failed install leaves the previous version intact', async () => {
    const src = path.join(base, 'src'); fs.cpSync(path.join(FIXTURES, 'example-skill'), src, { recursive: true })
    const reg = createRegistry(base)
    const first = await reg.install({ kind: 'folder', path: src })
    fs.writeFileSync(path.join(src, 'SKILL.md'), 'broken')
    await expect(reg.install({ kind: 'folder', path: src })).rejects.toThrow(/frontmatter/)
    expect(fs.readFileSync(path.join(first.path, 'SKILL.md'), 'utf8')).toContain('Example Cover Notes')
  })
})
