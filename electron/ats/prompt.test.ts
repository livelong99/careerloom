import { describe, expect, it } from 'vitest'

import { verifyCourses } from './courses'
import { SAMPLE_CV } from './fixtures'
import { buildPrompt, extractJson, repairPrompt, validateAgentOutput } from './prompt'

const good = {
  status: 'done', score: 99,
  jd: { requirements: [{ id: 'r1', text: 'Kafka', skill: 'Kafka', required: true, score: 4 }] },
  judgements: [{ req_id: 'r1', match: 'none', certain: true }],
  findings: [{ id: 'f1', severity: 'major', category: 'keyword', title: 'Show Kafka', detail: 'd', match_score: 3, apply: { op: 'append', target: 'Skills', after: '- Kafka', requires_answers: ['have:Kafka'] } }, { title: '' }, { id: 'f2', title: 'x', severity: 'bogus', apply: { op: 'explode', target: 'a', after: 'b' } }],
  skill_gaps: [{ skill: 'Kafka', howToAdd: 'Build a consumer.' }],
  courses: [{ title: 'c', url: 'https://x.dev/c' }], plan: '# plan', questions: [],
}

describe('validateAgentOutput', () => {
  it('accepts a good answer, drops junk and strips every score', () => {
    const r = validateAgentOutput(JSON.stringify(good), { needJd: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.out.findings.map(f => f.id)).toEqual(['f1', 'f2'])
    expect(r.out.findings[1]).toMatchObject({ severity: 'minor', apply: undefined })
    expect(r.out.findings[0]!.apply).toMatchObject({ op: 'append', requires_answers: ['have:Kafka'] })
    expect(JSON.stringify(r.out)).not.toMatch(/score/i)
    expect(r.out.skillHints.kafka).toMatch(/consumer/)
  })
  it('structural faults come back as repair errors', () => {
    expect(validateAgentOutput('nope', { needJd: true })).toMatchObject({ ok: false })
    expect(validateAgentOutput('{"status":"maybe"}', { needJd: false })).toMatchObject({ ok: false })
    const r = validateAgentOutput('{"status":"needs_input","questions":[]}', { needJd: false })
    expect(r).toMatchObject({ ok: false, errors: [expect.stringMatching(/questions/)] })
    expect(validateAgentOutput(JSON.stringify({ status: 'done', jd: { requirements: [] } }), { needJd: true })).toMatchObject({ ok: false })
  })
  it('caps questions at 5', () => {
    const q = Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, text: 't' }))
    const r = validateAgentOutput(JSON.stringify({ status: 'needs_input', questions: q }), { needJd: false })
    expect(r.ok && r.out.questions).toHaveLength(5)
  })
})

describe('prompts', () => {
  it('are lean: the prompt is the résumé + JD + a short shape, under 2.5k tokens for a sample', () => {
    const p = buildPrompt({ cv: SAMPLE_CV, jd: 'We need Kafka. '.repeat(50), outPath: '/x/out.json', canSearch: true })
    expect(p.length / 4).toBeLessThan(2500)
    expect(p).toMatch(/^Careerloom ATS analysis/)
    expect(p).toContain('12: ')
  })
  it('only asks for courses when the runner can search', () => {
    expect(buildPrompt({ cv: 'a', jd: 'b', outPath: 'o', canSearch: false })).toMatch(/cannot search/)
    expect(buildPrompt({ cv: 'a', jd: 'b', outPath: 'o', canSearch: true })).toMatch(/only from web search/)
  })
  it('the repair prompt carries the errors', () => expect(repairPrompt(['bad status'], 'o.json')).toMatch(/bad status/))
  it('extractJson finds the object in fenced or chatty text', () => {
    expect(extractJson('here you go ```json\n{"a":1}\n``` done')).toBe('{"a":1}')
    expect(extractJson('prefix {"a":{"b":2}} suffix')).toBe('{"a":{"b":2}}')
    expect(extractJson('no json')).toBeNull()
  })
})

describe('verifyCourses', () => {
  const raw = [
    { title: 'Live free', url: 'https://ocw.mit.edu/x', free: true, skill: 'Kafka' },
    { title: 'Dead', url: 'https://dead.example.com/x' },
    { title: 'HEAD refused', url: 'https://refuses-head.dev/x', free: false },
    { title: 'Local', url: 'http://localhost:3000/x' },
    { title: 'Creds', url: 'https://user:pw@evil.dev/x' },
    { title: 'Dup', url: 'https://ocw.mit.edu/x' },
    { title: '', url: 'https://notitle.dev' },
  ]
  const fetcher = async (url: string, method: 'HEAD' | 'GET') => {
    if (url.includes('dead')) return { status: 404 }
    if (url.includes('refuses-head') && method === 'HEAD') return { status: 405 }
    return { status: 200 }
  }
  it('keeps only live public pages, stamps verified_at, free first, and reports why others were dropped', async () => {
    const { courses, dropped } = await verifyCourses(raw, fetcher, 1234)
    expect(courses.map(c => c.title)).toEqual(['Live free', 'HEAD refused'])
    expect(courses.every(c => c.verified_at === 1234)).toBe(true)
    expect(dropped.map(d => d.url).sort()).toEqual(['http://localhost:3000/x', 'https://dead.example.com/x', 'https://user:pw@evil.dev/x'].sort())
  })
  it('a thrown fetch (timeout) drops the course', async () => {
    const { courses } = await verifyCourses([raw[0]], async () => { throw new Error('timeout') }, 1)
    expect(courses).toEqual([])
  })
})
