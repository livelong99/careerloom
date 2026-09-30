import { describe, expect, it, vi } from 'vitest'

import type { TextCall } from '../humanizer'
import { aiTells, gateLetter, inCv } from './gate'
import { tailorResume, writeCover } from './generate'
import { applyEdits, parseEdits } from './resumeEdits'

const CV = `# Jane Doe

## Summary
Backend engineer with 4 years of experience building Kubernetes platforms.

## Experience
### Platform Engineer, Initech (2021-2025)
- Ran Kubernetes clusters on AWS serving 40 internal teams.
- Cut CI time by 50% with Terraform modules.
`
const INPUT = { cv: CV, posting: null, company: 'Acme Corp', role: 'Platform Engineer', plan: [], missing: ['Rust'] }
const ok = (text: string, tokens = 100): TextCall => async () => ({ text, tokens, model: 'm' })
const json = (o: unknown) => JSON.stringify(o)

describe('gate', () => {
  it('matches quotes loosely but requires a real stretch of the résumé', () => {
    expect(inCv('ran kubernetes  clusters on AWS', CV)).toBe(true)
    expect(inCv('invented thing', CV)).toBe(false)
    expect(inCv('ran', CV)).toBe(false)
  })
  it('passes a letter built from the résumé and the job facts', () => {
    const d = { paragraphs: ['At Initech I ran Kubernetes clusters on AWS for 40 internal teams. Acme Corp needs that.'], claims: [{ sentence: 'At Initech I ran Kubernetes clusters on AWS for 40 internal teams.', cv_source_quote: 'Ran Kubernetes clusters on AWS serving 40 internal teams' }], learning: [] }
    expect(gateLetter(d, CV, ['Acme Corp', 'Platform Engineer']).ok).toBe(true)
  })
  it('blocks an invented number, employer and skill', () => {
    const d = { paragraphs: ['At Globex I cut costs by 90% using Rust.'], claims: [], learning: [] }
    const g = gateLetter(d, CV, [])
    expect(g.ok).toBe(false)
    expect(g.violations.join(' ')).toMatch(/90|Globex|Rust/)
  })
  it('allows a missing skill only as stated interest', () => {
    const interest = { paragraphs: ['I want to build more depth in Rust.'], claims: [], learning: ['Rust'] }
    expect(gateLetter(interest, CV, []).ok).toBe(true)
    const claimed = { paragraphs: ['I shipped production services in Rust.'], claims: [], learning: ['Rust'] }
    expect(gateLetter(claimed, CV, []).ok).toBe(false)
  })
  it('flags AI tells without blocking', () => {
    expect(aiTells('I am thrilled to apply — a testament to my work.')).toEqual(expect.arrayContaining(['dashes used as punctuation', '"I am excited/thrilled" opener', 'stock AI wording']))
    expect(aiTells('I ran clusters.')).toEqual([])
  })
})

describe('résumé edits', () => {
  const edit = { section: 'Summary', before: 'Backend engineer with 4 years of experience building Kubernetes platforms.', after: 'Platform engineer with 4 years of experience running Kubernetes.', cv_source_quote: 'building Kubernetes platforms' }
  it('applies a rephrase to a copy and never touches the original text', () => {
    const r = applyEdits(CV, [edit])
    expect(r.changes[0]!.status).toBe('applied')
    expect(r.cv).toContain('Platform engineer with 4 years')
    expect(CV).toContain('Backend engineer')
  })
  it('rejects invented facts, missing source text and unknown quotes', () => {
    const r = applyEdits(CV, [
      { ...edit, after: 'Platform engineer with 9 years of experience running Kubernetes.' },
      { ...edit, before: 'text that is not there' },
      { ...edit, cv_source_quote: 'something I made up entirely' },
      { ...edit, after: 'Platform engineer who knows Rust and Kubernetes.' },
    ])
    expect(r.changes.map(c => c.status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected'])
    expect(r.cv).toBe(CV)
  })
  it('parses tolerantly', () => {
    expect(parseEdits({ edits: [{ before: 'a', after: 'b' }, { before: '', after: 'x' }, 5] })).toHaveLength(1)
    expect(parseEdits(null)).toEqual([])
  })
  it('retries once with the problems, then returns the applied edits and usage', async () => {
    const bad = json({ edits: [{ ...edit, after: 'Platform engineer with 9 years.' }] })
    const good = json({ edits: [edit] })
    const run = vi.fn<TextCall>().mockResolvedValueOnce({ text: bad, tokens: 50, model: 'm' }).mockResolvedValueOnce({ text: good, tokens: 60, model: 'm' })
    const r = await tailorResume(INPUT, run)
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1]![0]).toContain('PREVIOUS ATTEMPT')
    expect(r.usage.tokens).toBe(110)
    expect(r.changes[0]!.status).toBe('applied')
  })
  it('fails clearly when the model never returns edits', async () => {
    await expect(tailorResume(INPUT, ok('nope'))).rejects.toThrow(/usable edits/)
  })
})

describe('cover letter', () => {
  const claim = { sentence: 'At Initech I ran Kubernetes clusters on AWS for 40 internal teams.', cv_source_quote: 'Ran Kubernetes clusters on AWS serving 40 internal teams' }
  const draft = json({ paragraphs: [claim.sentence, 'Acme Corp needs that kind of platform work.'], claims: [claim], learning: [] })
  const input = { ...INPUT, candidate: 'Jane Doe', strengths: [], tone: 'warm' as const, length: 'short' as const, allow: ['Acme Corp', 'Platform Engineer'] }

  it('drafts, gates and humanizes, reporting both token costs', async () => {
    const polish = ok('<final>At Initech I ran Kubernetes clusters on AWS for 40 internal teams.\n\nAcme Corp needs platform work like that.</final>', 400)
    const r = await writeCover(input, { humanize: true }, ok(draft, 900), polish)
    expect(r.humanized).toBe(true)
    expect(r.usage.tokens).toBe(900)
    expect(r.humanizeUsage?.tokens).toBe(400)
    expect(r.paragraphs[1]).toContain('platform work like that')
  })
  it('refuses a draft that invents facts (after one repair)', async () => {
    const bad = json({ paragraphs: ['At Globex I cut costs by 90%.'], claims: [], learning: [] })
    const write = vi.fn(ok(bad))
    await expect(writeCover(input, { humanize: false }, write, ok(''))).rejects.toThrow(/Blocked/)
    expect(write).toHaveBeenCalledTimes(2)
  })
  it('gate AFTER the humanizer: a rewrite that adds a fact is discarded, the gated draft is kept', async () => {
    const polish = ok('<final>At Initech I ran Kubernetes clusters on AWS for 40 internal teams and saved 3 million dollars.\n\nAcme Corp needs that.</final>')
    const r = await writeCover(input, { humanize: true }, ok(draft), polish)
    expect(r.humanized).toBe(false)
    expect(r.paragraphs[1]).toBe('Acme Corp needs that kind of platform work.')
    expect(r.notes.join(' ')).toMatch(/discarded/)
  })
  it('gate AFTER the humanizer: a rewrite that invents a number is caught', async () => {
    const polish = ok('<final>At Initech I ran clusters for 400 internal teams.\n\nAcme Corp needs that.</final>')
    const r = await writeCover(input, { humanize: true }, ok(draft), polish)
    expect(r.humanized).toBe(false)
  })
  it('a rewrite that DROPS a fact (the 40, the tool, the company) is discarded too', async () => {
    const polish = ok('<final>At Initech I ran clusters for many internal teams.\n\nThe platform team needs that kind of work.</final>')
    const r = await writeCover(input, { humanize: true }, ok(draft), polish)
    expect(r.humanized).toBe(false)
    expect(r.notes.join(' ')).toMatch(/dropped/)
  })
  it('keeps the draft when the humanizer call fails', async () => {
    const r = await writeCover(input, { humanize: true }, ok(draft), async () => { throw new Error('offline') })
    expect(r.humanized).toBe(false)
    expect(r.notes.join(' ')).toMatch(/skipped/)
  })
  it('skips the humanizer call when off', async () => {
    const polish = vi.fn(ok(''))
    const r = await writeCover(input, { humanize: false }, ok(draft), polish)
    expect(polish).not.toHaveBeenCalled()
    expect(r.humanizeUsage).toBeNull()
  })
})
