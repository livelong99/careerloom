import { describe, expect, it } from 'vitest'

import { applyOp, pushUndo, previewOp, unmetAnswers, UNDO_LIMIT } from './apply'
import { addedText, factCheck } from './factCheck'
import { SAMPLE_CV } from './fixtures'

const CV = SAMPLE_CV
const edit = (after: string) => CV.replace('Built PostgreSQL reporting pipelines processing 2 million records nightly for the finance team', after)

describe('factCheck', () => {
  it('allows a pure rephrase of the same facts', () => {
    const r = factCheck(CV, edit('Engineered nightly PostgreSQL reporting pipelines that process 2 million records for the finance team'))
    expect(r).toEqual({ ok: true, violations: [] })
  })
  it('flags a number that is not in the résumé', () => {
    const r = factCheck(CV, edit('Built PostgreSQL reporting pipelines processing 9 million records nightly for the finance team'))
    expect(r.ok).toBe(false)
    expect(r.violations.join()).toMatch(/9000000/)
  })
  it('treats 150K and 150,000 as the same number', () => {
    const before = '- Served 150,000 users across regions'
    expect(factCheck(before, '- Served 150K users across regions').ok).toBe(true)
  })
  it('flags a new skill and a new employer/name; a user answer makes them allowed', () => {
    const after = edit('Built Kafka reporting pipelines at Initech processing 2 million records nightly for the finance team')
    const r = factCheck(CV, after)
    expect(r.violations.join('\n')).toMatch(/Kafka/)
    expect(r.violations.join('\n')).toMatch(/Initech/)
    expect(factCheck(CV, after, ['Kafka yes', 'I worked at Initech']).ok).toBe(true)
  })
  it('ignores capitalised sentence openers (verbs)', () => {
    expect(factCheck(CV, edit('Streamlined PostgreSQL reporting for the finance team with 2 million nightly records')).ok).toBe(true)
  })
  it('addedText is the multiset difference of lines', () => {
    expect(addedText('a\nb\nb', 'a\nb\nc\nb')).toBe('c')
  })
})

describe('applyOp', () => {
  it('replace needs exactly one match', () => {
    const op = { op: 'replace' as const, target: 'Mentored four engineers', after: 'Coached four engineers', requires_answers: [] }
    const r = applyOp(CV, op)
    expect(r.ok && r.after.includes('Coached four engineers')).toBe(true)
    expect(applyOp(CV, { ...op, target: 'not here' })).toMatchObject({ ok: false })
    expect(applyOp('x x', { ...op, target: 'x' })).toMatchObject({ ok: false, error: expect.stringMatching(/more than once/) })
  })
  it('append adds to the end of a section, or creates it', () => {
    const r = applyOp(CV, { op: 'append', target: 'Skills', after: '- **Other:** Kafka', requires_answers: [] })
    expect(r.ok && r.after.trimEnd().endsWith('- **Other:** Kafka')).toBe(true)
    const inMiddle = applyOp(CV, { op: 'append', target: '## Projects', after: '- **Extra** — thing', requires_answers: [] })
    expect(inMiddle.ok && inMiddle.after.indexOf('- **Extra**') < inMiddle.after.indexOf('## Education')).toBe(true)
    const created = applyOp(CV, { op: 'append', target: 'Certifications', after: '- AWS SAA', requires_answers: [] })
    expect(created.ok && created.after.includes('## Certifications\n\n- AWS SAA')).toBe(true)
  })
  it('insert goes after a unique line; delete removes text', () => {
    const r = applyOp(CV, { op: 'insert', target: '## Summary', after: 'New line.', requires_answers: [] })
    expect(r.ok && r.after.includes('## Summary\nNew line.')).toBe(true)
    expect(applyOp(CV, { op: 'delete', target: '- **Ledger** — Open-source double-entry ledger in TypeScript with PostgreSQL, used by 300 developers worldwide\n', after: '', requires_answers: [] })).toMatchObject({ ok: true })
  })
  it('fills {{answer}} placeholders', () => {
    const r = applyOp(CV, { op: 'replace', target: 'Mentored four engineers', after: 'Mentored {{n}} engineers', requires_answers: ['n'] }, { n: 6 })
    expect(r.ok && r.after.includes('Mentored 6 engineers')).toBe(true)
  })
})

describe('previewOp', () => {
  const skill = { op: 'append' as const, target: 'Skills', after: '- **Additional:** Kafka', requires_answers: ['have:Kafka'] }
  it('blocks until the user confirms they have the skill', () => {
    expect(unmetAnswers(skill, {})).toEqual(['have:Kafka'])
    expect(unmetAnswers(skill, { 'have:Kafka': 'no' })).toEqual(['have:Kafka'])
    expect(previewOp(CV, skill, {}).error).toBeTruthy()
  })
  it('a confirmed skill passes the fact check; an unconfirmed fabrication does not', () => {
    expect(previewOp(CV, skill, { 'have:Kafka': 'yes' }).factCheck.ok).toBe(true)
    const sneaky = { ...skill, requires_answers: [] }
    expect(previewOp(CV, sneaky, {}).factCheck.ok).toBe(false)
  })
})

it('undo stack is capped at 50, newest kept', () => {
  let s: ReturnType<typeof pushUndo> = []
  for (let i = 0; i < UNDO_LIMIT + 5; i++) s = pushUndo(s, { undoId: `u${i}`, findingId: 'f', before: 'a', after: 'b', at: i })
  expect(s).toHaveLength(UNDO_LIMIT)
  expect(s[s.length - 1]!.undoId).toBe(`u${UNDO_LIMIT + 4}`)
})

describe('plural acronyms', () => {
  it('does not flag "VMs" as an invented name', () => {
    const r = factCheck('Led a Kubernetes migration.', 'Led a Kubernetes migration.\nWe moved services from VMs to containers.', [])
    expect(r.violations.filter(v => v.includes('VMs'))).toEqual([])
  })
})
