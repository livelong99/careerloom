import { describe, expect, it } from 'vitest'

import type { AtsEvent } from '../contract'
import { answerAnalysis, startAnalysis, type AgentRun, type Deps } from './analyze'
import { applyFinding, dismissFinding, previewFinding, undoApply } from './applyFlow'
import { SAMPLE_CV, htmlOf, onePagePdf } from './fixtures'
import type { Analysis, Store } from './store'
import type { UndoEntry } from './apply'

const JD = 'Senior backend engineer. 5+ years. Required: Node.js, PostgreSQL, Kafka, Kubernetes. Preferred: Terraform, Redis. '.repeat(3)
const REQS = ['Node.js', 'PostgreSQL', 'Kafka', 'Kubernetes'].map((s, i) => ({ id: `r${i}`, text: s, skill: s, required: true })).concat([{ id: 'r4', text: 'Terraform', skill: 'Terraform', required: false }])
const done = (extra: object = {}) => JSON.stringify({ status: 'done', score: 100, jd: { requirements: REQS }, judgements: [], findings: [], skill_gaps: [{ skill: 'Kafka', howToAdd: 'Write a consumer.' }], courses: [], plan: '# plan', questions: [], ...extra })

function memoryStore(): Store & { cache: Map<string, Analysis> } {
  let cur: Analysis | null = null
  let undo: UndoEntry[] = []
  const cache = new Map<string, Analysis>()
  return { cache, current: () => (cur ? structuredClone(cur) : null), save: a => { cur = structuredClone(a) }, cacheGet: k => cache.get(k) ?? null, cachePut: a => { cache.set(a.key, structuredClone(a)) }, undo: () => structuredClone(undo), setUndo: l => { undo = structuredClone(l) } }
}

function harness(opts: { runner?: string; cv?: string } = {}) {
  let cv = opts.cv ?? SAMPLE_CV
  let n = 0
  const events: AtsEvent[] = []
  const prompts: Array<{ prompt: string; resume?: string }> = []
  const files = new Map<string, string>()
  let pending: ((r: AgentRun) => void) | null = null
  const store = memoryStore()
  let rebuilt = 0
  const deps: Deps & { runnerName: string } = {
    runnerName: opts.runner ?? 'claude', store, now: () => Date.UTC(2026, 8, 1), newId: () => `id${++n}`,
    readCv: () => cv, writeCv: md => { cv = md },
    render: async () => ({ pdf: new Uint8Array(1), html: htmlOf(cv) }), pages: async () => onePagePdf(cv),
    runner() { return this.runnerName }, startAgent: (prompt, o) => { prompts.push({ prompt, resume: o.resume }); pending = o.onExit },
    agentFile: { path: id => `/tmp/${id}.json`, read: id => files.get(id) ?? null, remove: id => void files.delete(id) },
    sim: null, fetcher: async url => ({ status: url.includes('dead') ? 404 : 200 }), emit: e => void events.push(e),
    rebuildProfile: () => { rebuilt++; return true }, defaultTemplate: () => 'standard',
  }
  const finish = async (json: string | null, run: Partial<AgentRun> = {}) => {
    const id = store.current()!.id
    if (json !== null) files.set(id, json)
    const cb = pending!
    pending = null
    cb({ status: 'done', log: '', sessionId: 's-1', ...run })
    await new Promise(r => setTimeout(r, 25)) // afterRun is async
  }
  return { deps, events, prompts, finish, getCv: () => cv, setCv: (c: string) => { cv = c }, rebuilt: () => rebuilt, store }
}
const lastEvent = (h: ReturnType<typeof harness>) => h.events[h.events.length - 1]!

describe('analysis lifecycle', () => {
  it('without a JD: local parse + bullet checks only, no agent run', async () => {
    const h = harness()
    await startAnalysis(h.deps, {})
    expect(h.prompts).toHaveLength(0)
    const a = h.store.current()!
    expect(a.report.parse.score).toBeGreaterThan(50)
    expect(a.report.match).toBeUndefined()
    expect(lastEvent(h).phase).toBe('done')
  })

  it('one agent run: code scores, agent score is stripped, skill gaps are bucketed, hallucinated Apply targets are dropped', async () => {
    const h = harness()
    await startAnalysis(h.deps, { jd: JD })
    expect(h.prompts).toHaveLength(1)
    expect(h.store.current()!.report.parse.score).toBeGreaterThan(0) // parse lands before the agent finishes
    await h.finish(done({ findings: [
      { id: 'a1', severity: 'major', category: 'bullet', title: 'Tighten', detail: 'd', apply: { op: 'replace', target: 'Mentored four engineers', after: 'Coached four engineers', requires_answers: [] } },
      { id: 'a2', severity: 'minor', category: 'bullet', title: 'Invented', detail: 'd', apply: { op: 'replace', target: 'text that is not in the cv', after: 'x', requires_answers: [] } },
    ] }))
    const r = h.store.current()!.report
    expect(r.match).toBeDefined()
    expect(r.match!.score).toBeLessThan(100)
    expect(r.match!.caps.some(c => c.id === 'missing-required')).toBe(true)
    expect(r.skillGaps.find(g => g.skill === 'Kafka')).toMatchObject({ bucket: 'gap', howToAdd: 'Write a consumer.' })
    expect(r.skillGaps.find(g => g.skill === 'Node.js')!.bucket).toBe('existing')
    expect(r.findings.find(f => f.id === 'a1')!.apply).toBeDefined()
    expect(r.findings.find(f => f.id === 'a2')!.apply).toBeUndefined()
    expect(r.findings.some(f => f.id === 'skill:kafka' && f.apply?.requires_answers[0] === 'have:Kafka')).toBe(true)
    expect(JSON.stringify(r)).not.toMatch(/"score":100/)
    expect(r.notes?.some(n => /local model/i.test(n))).toBe(true) // degraded mode is explained
    expect(lastEvent(h).phase).toBe('done')
  })

  it('courses: verified on a searching runner (dead ones dropped); skipped with a clear note otherwise', async () => {
    const courses = [{ title: 'Kafka 101', url: 'https://ocw.mit.edu/kafka', free: true, skill: 'Kafka' }, { title: 'Dead', url: 'https://dead.example.com/k', skill: 'Kafka' }]
    const a = harness({ runner: 'claude' })
    await startAnalysis(a.deps, { jd: JD })
    await a.finish(done({ courses }))
    const r = a.store.current()!.report
    expect(r.courses.map(c => c.title)).toEqual(['Kafka 101'])
    expect(r.courses[0]!.verified_at).toBe(Date.UTC(2026, 8, 1))
    const b = harness({ runner: 'opencode' })
    await startAnalysis(b.deps, { jd: JD })
    expect(b.prompts[0]!.prompt).toMatch(/cannot search/)
    await b.finish(done({ courses }))
    expect(b.store.current()!.report.courses).toEqual([])
    expect(b.store.current()!.report.notes?.join(' ')).toMatch(/search the web/)
  })

  it('needs_input: asks, claude resumes the same session with the answers, then finishes', async () => {
    const h = harness({ runner: 'claude' })
    await startAnalysis(h.deps, { jd: JD })
    await h.finish(done({ status: 'needs_input', questions: [{ id: 'q1', text: 'How many engineers did you mentor?', type: 'number', why: 'to quantify' }] }))
    expect(lastEvent(h)).toMatchObject({ phase: 'agent', questions: [{ id: 'q1' }] })
    expect(h.store.current()!.report.session).toMatchObject({ runId: 'id1', sessionId: 's-1', round: 1 })
    await answerAnalysis(h.deps, 'id1', [{ id: 'q1', value: 6 }])
    expect(h.prompts[1]).toMatchObject({ resume: 's-1' })
    expect(h.prompts[1]!.prompt).toMatch(/q1: 6/)
    expect(h.prompts[1]!.prompt.length).toBeLessThan(600) // resume sends only the answers
    await h.finish(done())
    expect(h.store.current()!.report.session).toBeUndefined()
    expect(lastEvent(h).phase).toBe('done')
  })

  it('needs_input on codex (cannot resume): a stateless rerun with the answers and the partial result injected', async () => {
    const h = harness({ runner: 'codex' })
    await startAnalysis(h.deps, { jd: JD })
    await h.finish(done({ status: 'needs_input', questions: [{ id: 'q1', text: 'Scope?', why: 'w' }] }), { sessionId: null })
    await answerAnalysis(h.deps, 'id1', [{ id: 'q1', value: 'a team of six' }])
    expect(h.prompts[1]!.resume).toBeUndefined()
    expect(h.prompts[1]!.prompt).toMatch(/q1: a team of six/)
    expect(h.prompts[1]!.prompt).toMatch(/earlier partial result/)
    expect(h.prompts[1]!.prompt).toContain('Kafka') // the JD is re-sent
    await h.finish(done())
    expect(lastEvent(h).phase).toBe('done')
  })

  it('caps at 3 rounds: a needs_input on the last round is forced to done', async () => {
    const h = harness({ runner: 'claude' })
    await startAnalysis(h.deps, { jd: JD })
    for (let round = 1; round <= 2; round++) {
      await h.finish(done({ status: 'needs_input', questions: [{ id: `q${round}`, text: 'more?', why: 'w' }] }))
      expect(lastEvent(h).questions).toBeDefined()
      await answerAnalysis(h.deps, 'id1', [{ id: `q${round}`, value: 'x' }])
    }
    expect(h.prompts[2]!.prompt).toMatch(/last round/)
    await h.finish(done({ status: 'needs_input', questions: [{ id: 'q9', text: 'still?', why: 'w' }] }))
    expect(lastEvent(h).phase).toBe('done')
    expect(h.store.current()!.report.match).toBeDefined()
  })

  it('invalid JSON gets one repair retry, then falls back to local checks with a note', async () => {
    const h = harness()
    await startAnalysis(h.deps, { jd: JD })
    await h.finish('not json')
    expect(h.prompts).toHaveLength(2)
    expect(h.prompts[1]!.prompt).toMatch(/failed validation/)
    await h.finish('{"status":"maybe"}')
    expect(h.prompts).toHaveLength(2)
    expect(lastEvent(h).phase).toBe('done')
    expect(h.store.current()!.report.notes?.join(' ')).toMatch(/agent part was skipped/)
    expect(h.store.current()!.report.match).toBeUndefined()
  })

  it('a failed agent run keeps the local checks', async () => {
    const h = harness()
    await startAnalysis(h.deps, { jd: JD })
    await h.finish(null, { status: 'failed' })
    expect(h.store.current()!.report.parse.score).toBeGreaterThan(0)
    expect(lastEvent(h).message).toMatch(/failed/)
  })

  it('the same résumé + JD + template is served from cache without another agent run', async () => {
    const h = harness()
    await startAnalysis(h.deps, { jd: JD })
    await h.finish(done())
    await startAnalysis(h.deps, { jd: JD })
    expect(h.prompts).toHaveLength(1)
    expect(h.store.current()!.id).toBe('id2')
    expect(h.store.current()!.report.match).toBeDefined()
  })
})

describe('apply / undo', () => {
  const setup = async () => {
    const h = harness()
    await startAnalysis(h.deps, { jd: JD })
    await h.finish(done({ findings: [{ id: 'a1', severity: 'major', category: 'bullet', title: 'Tighten', detail: 'd', apply: { op: 'replace', target: 'Mentored four engineers', after: 'Coached four engineers', requires_answers: [] } },
      { id: 'a3', severity: 'minor', category: 'bullet', title: 'Invents', detail: 'd', apply: { op: 'replace', target: 'Mentored four engineers', after: 'Mentored nine engineers at Initech', requires_answers: [] } }] }))
    return h
  }

  it('applies a skill only after the user confirms they have it; rescore runs without the agent; undo restores', async () => {
    const h = await setup()
    const before = h.getCv()
    const beforeScore = h.store.current()!.report.match!.score
    await expect(previewFinding(h.deps, 'skill:kafka', [])).rejects.toThrow(/Answer first/)
    const prev = await previewFinding(h.deps, 'skill:kafka', [{ id: 'have:Kafka', value: 'yes' }])
    expect(prev.factCheck.ok).toBe(true)
    expect(prev.diff.after).toMatch(/Additional:\*\* Kafka/)
    const promptsBefore = h.prompts.length
    const res = await applyFinding(h.deps, 'skill:kafka', [{ id: 'have:Kafka', value: 'yes' }])
    expect(res.ok).toBe(true)
    expect(h.prompts.length).toBe(promptsBefore) // no agent
    expect(h.getCv()).toContain('- **Additional:** Kafka')
    expect(res.rescore!.match!.score).toBeGreaterThan(beforeScore)
    expect(res.rescore!.findings.find(f => f.id === 'skill:kafka')!.status).toBe('applied')
    expect(h.store.undo()).toHaveLength(1)
    const undone = await undoApply(h.deps, res.undoId!)
    expect(undone.ok).toBe(true)
    expect(h.getCv()).toBe(before)
    expect(h.store.undo()).toHaveLength(0)
    expect(undone.rescore!.match!.score).toBe(beforeScore)
  })

  it('factCheck blocks an edit that adds facts until the user explicitly overrides', async () => {
    const h = await setup()
    const blocked = await applyFinding(h.deps, 'a3', [])
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toMatch(/Blocked.*not in your résumé/)
    expect(h.getCv()).toBe(SAMPLE_CV)
    const forced = await applyFinding(h.deps, 'a3', [{ id: '_override', value: 1 }])
    expect(forced.ok).toBe(true)
  })

  it('undo reports a conflict when cv.md changed since the edit, and leaves it alone', async () => {
    const h = await setup()
    const res = await applyFinding(h.deps, 'a1', [])
    expect(res.ok).toBe(true)
    h.setCv(h.getCv() + '\n<!-- edited by hand -->\n')
    const undone = await undoApply(h.deps, res.undoId!)
    expect(undone.ok).toBe(false)
    expect(undone.error).toMatch(/Conflict/)
    expect(h.getCv()).toContain('edited by hand')
    expect(h.store.undo()).toHaveLength(1) // still there to retry after resolving
  })

  it('refuses to apply to a résumé that changed after the analysis', async () => {
    const h = await setup()
    h.setCv(h.getCv() + '\nextra line\n')
    const res = await applyFinding(h.deps, 'a1', [])
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/changed since this analysis/) })
  })

  it('dismiss persists; double apply is serialised (second sees a stale hash or no target)', async () => {
    const h = await setup()
    expect(dismissFinding(h.deps, 'a3')).toBe(true)
    expect(h.store.current()!.report.findings.find(f => f.id === 'a3')!.status).toBe('dismissed')
    const [r1, r2] = await Promise.all([applyFinding(h.deps, 'a1', []), applyFinding(h.deps, 'a1', [])])
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1)
    expect(h.store.undo()).toHaveLength(1)
  })

  it('content drift: "Rebuild template data" calls rebuildProfile, no cv.md edit, no undo entry', async () => {
    const h = harness()
    // a résumé whose rendered PDF omits a section (simulated by pages that drop Awards)
    const cv = SAMPLE_CV + '\n## Awards\n\n- Won the national robotics hackathon finals competition with autonomous warehouse drones\n- Gold medal in regional mathematics olympiad championship representing university team\n- Dean list scholarship recipient for outstanding academic performance across four semesters\n'.repeat(3)
    h.setCv(cv)
    h.deps.render = async () => ({ pdf: new Uint8Array(1), html: htmlOf(SAMPLE_CV) })
    h.deps.pages = async () => onePagePdf(SAMPLE_CV)
    await startAnalysis(h.deps, {})
    const drift = h.store.current()!.report.findings.find(f => f.id === 'parse.coverage')
    expect(drift).toBeDefined()
    expect(drift!.apply).toMatchObject({ op: 'rebuild-profile' })
    const res = await applyFinding(h.deps, 'parse.coverage', [])
    expect(res.ok).toBe(true)
    expect(h.rebuilt()).toBe(1)
    expect(h.getCv()).toBe(cv)
    expect(res.undoId).toBeUndefined()
  })
})
