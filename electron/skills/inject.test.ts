import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createSkillTools, prepareSkills, selectSkills } from './inject'
import { createRegistry } from './registry'
import type { InstalledSkill } from './types'

const FIXTURES = path.join(__dirname, '__fixtures__')
let base: string
let cwd: string
let skills: InstalledSkill[]
beforeEach(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-inj-'))
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-cwd-'))
  const reg = createRegistry(base)
  await reg.install({ kind: 'folder', path: path.join(FIXTURES, 'example-skill') })
  await reg.install({ kind: 'folder', path: path.join(FIXTURES, 'scripted-skill') }, { confirmedScripts: true })
  reg.setEnabled('scripted-skill', false)
  skills = reg.list()
})
afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); fs.rmSync(cwd, { recursive: true, force: true }) })

describe('selectSkills', () => {
  it('defaults to enabled; an explicit set overrides, even for disabled skills; unknown ids drop', () => {
    expect(selectSkills(skills).map(s => s.id)).toEqual(['example-cover-notes'])
    expect(selectSkills(skills, ['scripted-skill', 'nope']).map(s => s.id)).toEqual(['scripted-skill'])
    expect(selectSkills(skills, [])).toEqual([])
  })
})

describe.each([
  ['claude', '.claude/skills'],
  ['codex', '.codex/skills'],
  ['antigravity', '.agent/skills'],
  ['opencode', '.opencode/skill'],
] as const)('%s adapter', (runner, rel) => {
  it(`copies enabled skills into ${rel} and removes them (and empty parents) on cleanup`, () => {
    const p = prepareSkills(runner, cwd, undefined, skills)
    const dest = path.join(cwd, rel, 'example-cover-notes')
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toContain('Example Cover Notes')
    expect(fs.existsSync(path.join(cwd, rel, 'scripted-skill'))).toBe(false)
    expect(p.ids).toEqual(['example-cover-notes'])
    expect(p.tools).toBeNull()
    p.cleanup(); p.cleanup()
    expect(fs.readdirSync(cwd)).toEqual([])
  })

  it('leaves a pre-existing skill folder and its siblings alone', () => {
    const mine = path.join(cwd, rel, 'example-cover-notes'); fs.mkdirSync(mine, { recursive: true }); fs.writeFileSync(path.join(mine, 'SKILL.md'), 'mine')
    const other = path.join(cwd, rel, 'career-ops'); fs.mkdirSync(other, { recursive: true }); fs.writeFileSync(path.join(other, 'SKILL.md'), 'ops')
    const p = prepareSkills(runner, cwd, undefined, skills)
    expect(p.ids).toEqual([])
    p.cleanup()
    expect(fs.readFileSync(path.join(mine, 'SKILL.md'), 'utf8')).toBe('mine')
    expect(fs.readFileSync(path.join(other, 'SKILL.md'), 'utf8')).toBe('ops')
  })
})

describe('adapters', () => {
  it('only codex and antigravity get an index hint', () => {
    for (const r of ['claude', 'opencode'] as const) { const p = prepareSkills(r, cwd, undefined, skills); expect(p.promptHint).toBeNull(); p.cleanup() }
    for (const r of ['codex', 'antigravity'] as const) {
      const p = prepareSkills(r, cwd, undefined, skills)
      expect(p.promptHint).toMatch(/example-cover-notes: Drafts short.*SKILL\.md\)/)
      p.cleanup()
    }
  })

  it('concurrent runs share files; the last one out removes them', () => {
    const a = prepareSkills('claude', cwd, undefined, skills)
    const b = prepareSkills('claude', cwd, undefined, skills)
    a.cleanup()
    expect(fs.existsSync(path.join(cwd, '.claude/skills/example-cover-notes/SKILL.md'))).toBe(true)
    b.cleanup()
    expect(fs.existsSync(path.join(cwd, '.claude'))).toBe(false)
  })

  it('does nothing without skills, and nothing for the api runner', () => {
    expect(prepareSkills('claude', cwd, undefined, []).ids).toEqual([])
    const p = prepareSkills('api', cwd, undefined, skills)
    expect(p.promptHint).toBeNull()
    expect(fs.readdirSync(cwd)).toEqual([])
  })

  it('zen: index of name: description only, plus tools; nothing written', () => {
    const p = prepareSkills('zen', cwd, undefined, skills)
    expect(p.promptHint).toContain('- example-cover-notes: Drafts short')
    expect(p.promptHint).not.toContain('Read the job description') // bodies load on demand
    expect(p.tools).not.toBeNull()
    expect(fs.readdirSync(cwd)).toEqual([])
  })
})

describe('skill tools (zen)', () => {
  it('lists, reads SKILL.md by default, reads references', () => {
    const t = createSkillTools(selectSkills(skills))
    expect(t.list()).toBe(`- example-cover-notes: ${skills[0]!.description}`)
    expect(t.read('example-cover-notes')).toContain('Read the job description')
    expect(t.read('example-cover-notes', 'references/proof-points.md')).toContain('p95')
    expect(t.read('example-cover-notes', 'references')).toContain('proof-points.md')
  })

  it.each([['../scripted-skill/SKILL.md'], ['/etc/passwd'], ['references/../../x'], ['.careerloom-injected']])('refuses %s', file => {
    const t = createSkillTools(selectSkills(skills))
    expect(() => t.read('example-cover-notes', file)).toThrow()
  })

  it('refuses unknown skills and symlinks out of the skill', () => {
    const t = createSkillTools(skills)
    expect(() => t.read('nope')).toThrow(/No skill/)
    fs.symlinkSync(os.tmpdir(), path.join(skills[0]!.path, 'out'))
    expect(() => t.read('example-cover-notes', 'out')).toThrow(/inside the skill/)
  })

  it('truncates very long files', () => {
    fs.writeFileSync(path.join(skills[0]!.path, 'long.md'), 'x'.repeat(50_000))
    expect(createSkillTools(skills).read('example-cover-notes', 'long.md')).toMatch(/truncated 10000 chars/)
  })
})
