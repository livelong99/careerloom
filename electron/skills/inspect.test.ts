import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeZip } from './__fixtures__/makeZip'
import { inspectSource, normalizeGit, stage, type GitRunner } from './inspect'
import { SkillError } from './parse'
import { SKILL_LIMITS } from './types'

const FIXTURES = path.join(__dirname, '__fixtures__')
const SKILL = '---\nname: zipped\ndescription: from a zip\n---\nbody'
let tmp: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-inspect-')) })
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))
const zipAt = (specs: Parameters<typeof makeZip>[0]) => { const f = path.join(tmp, 'x.zip'); fs.writeFileSync(f, makeZip(specs)); return f }

describe('folder source', () => {
  it('previews the fixture: size, files, provides, no scripts', async () => {
    const p = await inspectSource({ kind: 'folder', path: path.join(FIXTURES, 'example-skill') })
    expect(p).toMatchObject({ id: 'example-cover-notes', version: '1.2.0', fileCount: 3, scripts: [], provides: ['cover-letter', 'outreach'], replaces: false })
    expect(p.sizeBytes).toBeGreaterThan(100)
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lists scripts and flags replacement of an installed id', async () => {
    const p = await inspectSource({ kind: 'folder', path: path.join(FIXTURES, 'scripted-skill') }, { installedIds: new Set(['scripted-skill']) })
    expect(p.scripts).toEqual(['scripts/hello.sh'])
    expect(p.replaces).toBe(true)
  })

  it('hash changes with content', async () => {
    const dir = path.join(tmp, 's'); fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL)
    const a = (await inspectSource({ kind: 'folder', path: dir })).hash
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `${SKILL}!`)
    expect((await inspectSource({ kind: 'folder', path: dir })).hash).not.toBe(a)
  })

  it('rejects missing folder, missing SKILL.md, escaping symlinks; skips inner ones', async () => {
    await expect(inspectSource({ kind: 'folder', path: path.join(tmp, 'nope') })).rejects.toThrow(/does not exist/)
    const dir = path.join(tmp, 's'); fs.mkdirSync(dir)
    await expect(inspectSource({ kind: 'folder', path: dir })).rejects.toThrow(/No SKILL.md/)
    fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL)
    fs.symlinkSync(os.tmpdir(), path.join(dir, 'out'))
    await expect(inspectSource({ kind: 'folder', path: dir })).rejects.toMatchObject({ code: 'unsafe' })
    fs.rmSync(path.join(dir, 'out'))
    fs.symlinkSync(path.join(dir, 'SKILL.md'), path.join(dir, 'alias.md'))
    expect((await inspectSource({ kind: 'folder', path: dir })).warnings.join()).toMatch(/symlink/)
  })

  it('enforces file-count and size caps, warns on binaries', async () => {
    const dir = path.join(tmp, 's'); fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL)
    fs.writeFileSync(path.join(dir, 'tool.bin'), Buffer.from([0, 1, 2]))
    expect((await inspectSource({ kind: 'folder', path: dir })).warnings).toContain('tool.bin is a binary file')
    fs.writeFileSync(path.join(dir, 'big.txt'), Buffer.alloc(SKILL_LIMITS.maxBytes + 1, 97))
    await expect(inspectSource({ kind: 'folder', path: dir })).rejects.toMatchObject({ code: 'limits' })
    fs.rmSync(path.join(dir, 'big.txt'))
    for (let i = 0; i <= SKILL_LIMITS.maxFiles; i++) fs.writeFileSync(path.join(dir, `f${i}.md`), 'x')
    await expect(inspectSource({ kind: 'folder', path: dir })).rejects.toMatchObject({ code: 'limits' })
  })
})

describe('zip source', () => {
  it('extracts, descends into a single wrapper folder and cleans up', async () => {
    const f = zipAt([{ name: 'repo-main/', data: '' }, { name: 'repo-main/SKILL.md', data: SKILL }, { name: 'repo-main/scripts/run.sh', data: 'echo', mode: 0o100755 }])
    const staged = await stage({ kind: 'zip', path: f }, { tmpRoot: tmp })
    expect(staged.preview).toMatchObject({ id: 'zipped', scripts: ['scripts/run.sh'], fileCount: 2 })
    expect(fs.existsSync(path.join(staged.dir, 'SKILL.md'))).toBe(true)
    staged.cleanup()
    expect(fs.existsSync(staged.dir)).toBe(false)
  })

  it.each([
    ['parent traversal', '../evil.txt'],
    ['nested traversal', 'a/../../evil.txt'],
    ['absolute path', '/etc/evil.txt'],
    ['windows drive', 'C:/evil.txt'],
    ['backslash traversal', '..\\evil.txt'],
  ])('rejects %s', async (_l, name) => {
    const f = zipAt([{ name: 'SKILL.md', data: SKILL }, { name, data: 'x' }])
    await expect(inspectSource({ kind: 'zip', path: f })).rejects.toMatchObject({ code: 'unsafe' })
    expect(fs.existsSync(path.join(tmp, 'evil.txt'))).toBe(false)
  })

  it('rejects symlink entries, size lies, junk and non-zips', async () => {
    await expect(inspectSource({ kind: 'zip', path: zipAt([{ name: 'SKILL.md', data: SKILL }, { name: 'l', data: '/etc', mode: 0o120777 }]) })).rejects.toThrow(/symlink/)
    await expect(inspectSource({ kind: 'zip', path: zipAt([{ name: 'SKILL.md', data: SKILL, declaredSize: 3 }]) })).rejects.toMatchObject({ code: 'limits' })
    await expect(inspectSource({ kind: 'zip', path: zipAt([{ name: 'SKILL.md', data: SKILL, declaredSize: SKILL_LIMITS.maxBytes + 1 }]) })).rejects.toMatchObject({ code: 'limits' })
    const junk = path.join(tmp, 'j.zip'); fs.writeFileSync(junk, 'not a zip')
    await expect(inspectSource({ kind: 'zip', path: junk })).rejects.toThrow(/valid .zip/)
    await expect(inspectSource({ kind: 'zip', path: path.join(tmp, 'a.txt') })).rejects.toThrow(/\.zip/)
  })

  it('accepts a stored (uncompressed) entry', async () => {
    const f = zipAt([{ name: 'SKILL.md', data: SKILL, stored: true }])
    expect((await inspectSource({ kind: 'zip', path: f })).id).toBe('zipped')
  })
})

describe('normalizeGit', () => {
  it('expands owner/repo shorthand with subdir and ref', () => {
    expect(normalizeGit({ url: 'acme/skills' })).toEqual({ url: 'https://github.com/acme/skills', ref: undefined, subdir: undefined })
    expect(normalizeGit({ url: 'acme/skills/tools/cover@v2' })).toEqual({ url: 'https://github.com/acme/skills', ref: 'v2', subdir: 'tools/cover' })
    expect(normalizeGit({ url: 'acme/skills.git' }).url).toBe('https://github.com/acme/skills')
  })

  it('accepts https and ssh URLs', () => {
    expect(normalizeGit({ url: 'https://gitlab.com/a/b.git', ref: 'main' }).url).toBe('https://gitlab.com/a/b.git')
    expect(normalizeGit({ url: 'git@github.com:a/b.git' }).url).toBe('git@github.com:a/b.git')
    expect(normalizeGit({ url: 'ssh://git@host/a/b.git' }).url).toBe('ssh://git@host/a/b.git')
  })

  it.each([
    'file:///etc/passwd', 'http://github.com/a/b', 'git://github.com/a/b', 'ext::sh -c id', '--upload-pack=evil', '-oProxyCommand=x',
    'ftp://x/y', 'javascript:alert(1)', 'justaword', '', 'a b/c', 'https://user:pw@github.com/a/b', '/abs/path', '../x/y',
  ])('rejects %j', url => {
    expect(() => normalizeGit({ url })).toThrow(SkillError)
  })

  it('rejects hostile ref and subdir', () => {
    expect(() => normalizeGit({ url: 'a/b', ref: '--upload-pack=x' })).toThrow()
    expect(() => normalizeGit({ url: 'a/b', ref: 'x y' })).toThrow()
    expect(() => normalizeGit({ url: 'a/b', subdir: '../../etc' })).toThrow()
    expect(() => normalizeGit({ url: 'a/b/../../c' })).toThrow()
  })
})

describe('git source (mocked git)', () => {
  const fakeGit = (populate: (clone: string) => void): GitRunner => vi.fn(async (args: string[]) => {
    const clone = args[args.length - 1]!
    fs.mkdirSync(clone, { recursive: true })
    populate(clone)
  })

  it('clones with an argv array, ref and `--`, then inspects the subdir', async () => {
    const git = fakeGit(c => { fs.mkdirSync(path.join(c, 'skills', 'z'), { recursive: true }); fs.writeFileSync(path.join(c, 'skills', 'z', 'SKILL.md'), SKILL) })
    const staged = await stage({ kind: 'git', url: 'acme/skills/skills/z@v1' }, { git, tmpRoot: tmp })
    const args = (git as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string[]
    expect(args.slice(0, 3)).toEqual(['clone', '--depth', '1'])
    expect(args).toContain('--branch'); expect(args[args.indexOf('--branch') + 1]).toBe('v1')
    expect(args[args.length - 2]).toBe('https://github.com/acme/skills')
    expect(args[args.length - 3]).toBe('--')
    expect(staged.preview.source).toEqual({ kind: 'git', url: 'https://github.com/acme/skills', ref: 'v1', subdir: 'skills/z' })
    staged.cleanup()
  })

  it('never calls git for a rejected URL, and cleans the temp dir when inspection fails', async () => {
    const git = fakeGit(() => {})
    await expect(stage({ kind: 'git', url: 'file:///etc' }, { git, tmpRoot: tmp })).rejects.toThrow(/allowed/)
    expect(git).not.toHaveBeenCalled()
    await expect(stage({ kind: 'git', url: 'a/b' }, { git, tmpRoot: tmp })).rejects.toThrow(/No SKILL.md/)
    expect(fs.readdirSync(tmp)).toEqual([])
  })

  it('rejects a subdir that is a symlink out of the clone, and a missing subdir', async () => {
    const out = fs.mkdtempSync(path.join(tmp, 'outside-')); fs.writeFileSync(path.join(out, 'SKILL.md'), SKILL)
    const git = fakeGit(c => fs.symlinkSync(out, path.join(c, 'link')))
    await expect(stage({ kind: 'git', url: 'a/b/link' }, { git, tmpRoot: tmp })).rejects.toMatchObject({ code: 'unsafe' })
    await expect(stage({ kind: 'git', url: 'a/b/nope' }, { git: fakeGit(() => {}), tmpRoot: tmp })).rejects.toThrow(/no folder/)
  })
})
