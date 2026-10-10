import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { kebab, parseSkill, SkillError } from './parse'

const fx = (p: string) => readFileSync(join(__dirname, '__fixtures__', p), 'utf8')
const md = (fm: string) => `---\n${fm}\n---\n\nbody`

describe('parseSkill', () => {
  it('reads the fixture, with careerloom.json overriding version and listing capabilities', () => {
    const meta = parseSkill(fx('example-skill/SKILL.md'), fx('example-skill/careerloom.json'))
    expect(meta).toMatchObject({ id: 'example-cover-notes', name: 'Example Cover Notes', version: '1.2.0', license: 'MIT', provides: ['cover-letter', 'outreach'] })
  })

  it('falls back to frontmatter version and metadata.version', () => {
    expect(parseSkill(md('name: a\ndescription: d\nversion: 2')).version).toBe('2')
    expect(parseSkill(md('name: a\ndescription: d\nmetadata:\n  version: "0.3"')).version).toBe('0.3')
    expect(parseSkill(md('name: a\ndescription: d')).version).toBeNull()
  })

  it('accepts CRLF files', () => {
    expect(parseSkill('---\r\nname: crlf\r\ndescription: ok\r\n---\r\nbody').id).toBe('crlf')
  })

  it.each([
    ['no frontmatter', 'just text'],
    ['missing description', md('name: a')],
    ['missing name', md('description: d')],
    ['empty name after kebab', md('name: "!!!"\ndescription: d')],
    ['name too long', md(`name: ${'a'.repeat(65)}\ndescription: d`)],
    ['description too long', md(`name: a\ndescription: ${'d'.repeat(1025)}`)],
    ['list frontmatter', '---\n- a\n- b\n---\n'],
    ['bad yaml', '---\nname: [unclosed\n---\n'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseSkill(text)).toThrow(SkillError)
  })

  it('rejects bad careerloom.json', () => {
    expect(() => parseSkill(md('name: a\ndescription: d'), '{nope')).toThrow(/careerloom.json/)
  })

  it('ignores malformed provides entries', () => {
    expect(parseSkill(md('name: a\ndescription: d'), '{"provides":[1,null,{"x":1},"ok"]}').provides).toEqual(['ok'])
  })
})

describe('kebab', () => {
  it('normalises names to ids', () => {
    expect(kebab('Résumé Tailor v2!')).toBe('resume-tailor-v2')
    expect(kebab('../../etc')).toBe('etc')
  })
})
