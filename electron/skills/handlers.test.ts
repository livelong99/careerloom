import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { argsForPrompt } from '../runner'
import { createSkillsHandlers, validateSource } from './handlers'
import { createRegistry } from './registry'

const FIXTURE = path.join(__dirname, '__fixtures__', 'example-skill')
let base: string
beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-h-')) })
afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

const make = (picked: string | null = FIXTURE) => {
  const pick = vi.fn(async () => picked)
  return { h: createSkillsHandlers({ registry: () => createRegistry(base), pick }), pick }
}

describe('validateSource', () => {
  const none = new Set<string>()
  it('accepts a git source and keeps only known fields', () => {
    expect(validateSource({ kind: 'git', url: 'a/b', ref: 'v1', subdir: 's', extra: 1 }, none)).toEqual({ kind: 'git', url: 'a/b', ref: 'v1', subdir: 's' })
    expect(validateSource({ kind: 'git', url: 'a/b' }, none)).toEqual({ kind: 'git', url: 'a/b' })
  })

  it.each([null, undefined, 'git', 5, {}, { kind: 'nope' }, { kind: 'git' }, { kind: 'git', url: 5 }, { kind: 'git', url: '' }, { kind: 'git', url: 'x'.repeat(501) },
    { kind: 'git', url: 'a/b', ref: 5 }, { kind: 'git', url: 'a\0b' }, { kind: 'folder' }, { kind: 'zip', path: 5 }])('rejects %j', raw => {
    expect(() => validateSource(raw, none)).toThrow()
  })

  it('accepts local paths only when the native dialog returned them', () => {
    expect(() => validateSource({ kind: 'folder', path: '/etc' }, none)).toThrow(/Browse/)
    expect(validateSource({ kind: 'zip', path: '/x/s.zip' }, new Set(['/x/s.zip']))).toEqual({ kind: 'zip', path: '/x/s.zip' })
  })
})

describe('skills handlers', () => {
  it('rejects a renderer-supplied folder that was never picked', async () => {
    const { h } = make()
    expect(() => h.skillsInspect!({ kind: 'folder', path: FIXTURE })).toThrow(/Browse/)
    expect(() => h.skillsInstall!({ kind: 'folder', path: FIXTURE }, {})).toThrow(/Browse/)
  })

  it('pick → inspect → install → list → toggle → update → remove', async () => {
    const { h, pick } = make()
    const p = await h.skillsPick!('folder')
    expect(p).toBe(FIXTURE); expect(pick).toHaveBeenCalledWith('folder')
    const source = { kind: 'folder', path: FIXTURE }
    expect(await h.skillsInspect!(source)).toMatchObject({ id: 'example-cover-notes', replaces: false })
    const installed = await h.skillsInstall!(source, { confirmedScripts: false }) as { id: string }
    expect(await h.skillsList!()).toHaveLength(1)
    expect(await h.skillsSetEnabled!(installed.id, false)).toMatchObject({ enabled: false })
    expect(await h.skillsUpdate!(installed.id)).toMatchObject({ replaces: true })
    await h.skillsRemove!(installed.id)
    expect(await h.skillsList!()).toEqual([])
  })

  it('only literal true counts as script consent', async () => {
    const dir = path.join(__dirname, '__fixtures__', 'scripted-skill')
    const { h } = make(dir)
    await h.skillsPick!('folder')
    for (const opts of [undefined, null, {}, { confirmedScripts: 'yes' }, { confirmedScripts: 1 }]) {
      await expect(Promise.resolve().then(() => h.skillsInstall!({ kind: 'folder', path: dir }, opts))).rejects.toMatchObject({ code: 'consent' })
    }
    await expect(h.skillsInstall!({ kind: 'folder', path: dir }, { confirmedScripts: true })).resolves.toMatchObject({ hasScripts: true })
  })

  it('validates ids, flags and picker kinds', async () => {
    const { h, pick } = make()
    for (const id of ['../x', '', 5, null, 'A B']) expect(() => h.skillsRemove!(id)).toThrow()
    expect(() => h.skillsSetEnabled!('ok', 'true')).toThrow(/true or false/)
    expect(() => h.skillsUpdate!({})).toThrow()
    await expect(h.skillsPick!('file')).rejects.toThrow(/Unknown picker/)
    expect(pick).not.toHaveBeenCalled()
  })

  it('a cancelled picker returns null and authorises nothing', async () => {
    const { h } = make(null)
    expect(await h.skillsPick!('zip')).toBeNull()
    expect(() => h.skillsInspect!({ kind: 'zip', path: '/a.zip' })).toThrow(/Browse/)
  })
})

describe('runner hook', () => {
  it('codex and agy carry the skills index; claude and opencode do not', () => {
    const hint = '- x: does x'
    expect(argsForPrompt('codex', '/career-ops evaluate', { skillsHint: hint }).args.at(-1)).toContain(hint)
    expect(argsForPrompt('antigravity', '/career-ops evaluate', { skillsHint: hint }).args[1]).toContain(hint)
    expect(argsForPrompt('claude', '/career-ops evaluate', { skillsHint: hint }).args.join('\n')).not.toContain(hint)
    expect(argsForPrompt('codex', '/career-ops evaluate').args.at(-1)).not.toContain('\n\n')
    expect(argsForPrompt('antigravity', '/career-ops evaluate').args[1]).toBe('/career-ops evaluate')
  })
})
