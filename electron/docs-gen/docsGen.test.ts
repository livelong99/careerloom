import { describe, expect, it, vi } from 'vitest'

import type { TextCall } from '../humanizer'
import { aiTells, gateLetter, inCv } from './gate'
import { readDraft, tailorResume, writeCover } from './generate'
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
  const tagged = (paragraphs: string[], claims: Array<{ sentence: string; cv_source_quote: string }> = [], learning: string[] = []) => `<letter>\n${paragraphs.join('\n\n')}\n</letter>\n<claims>\n${claims.map(c => `${c.sentence} ||| ${c.cv_source_quote}`).join('\n')}\n</claims>\n<learning>${learning.join(', ')}</learning>`
  const draft = tagged([claim.sentence, 'Acme Corp needs that kind of platform work.'], [claim])
  const input = { ...INPUT, candidate: 'Jane Doe', strengths: [], tone: 'warm' as const, length: 'short' as const, allow: ['Acme Corp', 'Platform Engineer'] }

  it('reads the tagged draft, with quotes and line breaks that would break JSON', () => {
    const d = readDraft(`thinking...\n<letter>\nShe said "hi"\nand left.\n\nSecond.\n</letter>\n<claims>\nShe said "hi" and left. ||| said hi to everyone\nbad line\n</claims>\n<learning>Rust, Go</learning>`)
    expect(d.paragraphs).toEqual(['She said "hi" and left.', 'Second.'])
    expect(d.claims).toEqual([{ sentence: 'She said "hi" and left.', cv_source_quote: 'said hi to everyone' }])
    expect(d.learning).toEqual(['Rust', 'Go'])
    expect(() => readDraft('no tags')).toThrow(/letter/)
  })
  it('drafts, gates and humanizes, reporting both token costs', async () => {
    const polish = ok('<final>At Initech I ran Kubernetes clusters on AWS for 40 internal teams.\n\nAcme Corp needs platform work like that.</final>', 400)
    const r = await writeCover(input, { humanize: true }, ok(draft, 900), polish)
    expect(r.humanized).toBe(true)
    expect(r.usage.tokens).toBe(900)
    expect(r.humanizeUsage?.tokens).toBe(400)
    expect(r.paragraphs[1]).toContain('platform work like that')
  })
  it('refuses a draft that invents facts (after one repair)', async () => {
    const bad = tagged(['At Globex I cut costs by 90%.'])
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

describe('tolerant draft parsing', () => {
  it('accepts a JSON reply with |||-joined claim strings and a string `learning` (seen from a free model)', () => {
    const d = readDraft('thinking\n```json\n{"paragraphs":["One.","Two."],"claims":["One. ||| a real quote here",{"sentence":"Two.","cv_source_quote":"another quote"}],"learning":"Go, GCP"}\n```')
    expect(d.paragraphs).toEqual(['One.', 'Two.'])
    expect(d.claims).toHaveLength(2)
    expect(d.learning).toEqual(['Go', 'GCP'])
  })
  it('accepts missing closing tags and keeps the pre-humanizer draft', async () => {
    const d = readDraft('<letter>\nOne.\n\nTwo.\n<claims>\nOne. ||| real quote here\n<learning>')
    expect(d.paragraphs).toEqual(['One.', 'Two.'])
    expect(d.claims).toHaveLength(1)
    const claim = { sentence: 'At Initech I ran Kubernetes clusters on AWS for 40 internal teams.', cv_source_quote: 'Ran Kubernetes clusters on AWS serving 40 internal teams' }
    const text = `<letter>\n${claim.sentence} I am thrilled — truly.\n</letter>\n<claims>\n${claim.sentence} ||| ${claim.cv_source_quote}\n</claims>\n<learning></learning>`
    const r = await writeCover({ ...INPUT, candidate: 'J', strengths: [], tone: 'warm', length: 'short', allow: ['Acme Corp'] }, { humanize: true }, ok(text), ok(`<final>${claim.sentence} Acme Corp hires for this.</final>`))
    expect(r.humanized).toBe(true)
    expect(r.tellsBefore.length).toBeGreaterThan(0)
    expect(r.tells).toEqual([])
    expect(r.draftParagraphs[0]).toContain('thrilled')
  })
  it('explains an empty reply (a reasoning model that spent its output budget thinking)', async () => {
    await expect(writeCover({ ...INPUT, candidate: 'J', strengths: [], tone: 'warm', length: 'short', allow: [] }, { humanize: false }, ok('  '), ok(''))).rejects.toThrow(/output budget/)
  })
  it('says a readable-letter problem, not a fact problem, when the reply has no letter', async () => {
    await expect(writeCover({ ...INPUT, candidate: 'J', strengths: [], tone: 'warm', length: 'short', allow: [] }, { humanize: false }, ok('just chatter'), ok(''))).rejects.toThrow(/readable letter/)
  })
})

describe('prompts', () => {
  it('never start like a CLI flag (startAgentPrompt refuses those) and say there are no tools', async () => {
    const { resumePrompt, coverPrompt } = await import('./prompts')
    const { fillPrompt } = await import('../job-view/jdStructure')
    for (const p of [resumePrompt(INPUT), coverPrompt({ ...INPUT, candidate: 'J', strengths: [], tone: 'warm', length: 'short' }), fillPrompt('jd', ['summary'])]) {
      expect(p).toMatch(/^[A-Za-z]/)
      expect(p).toContain('no tools')
    }
  })
})
