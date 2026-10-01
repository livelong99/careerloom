// @vitest-environment node
// The KB seams end to end on fakes: research -> real store (hashed job folder) -> API views -> interviewer pool -> stats back on the items.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getVersion: () => '0.2.0' }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import type { RunRecord, RunStart } from '../context'
import type { TranscriptLine } from '../copilot/types'
import { scripted } from '../interviewer/fixtures/scripted-llm'
import { interviewPool, setInterviewPool } from '../interviewer/pool'
import { parsePlan } from '../interviewer/plan'
import { createInterview } from '../interviewer/session'
import { createKbApi } from './api'
import { DEFAULT_INTERVIEW_CONFIG } from './config'
import { kbJobDir } from './hash'
import { createFakeLlm } from './research/fixtures/llm'
import { CV, JOB } from './research/fixtures/job'
import { ALL_RESULTS, createFakeWeb } from './research/fixtures/web'
import { clearRobotsCache } from './research/robots'
import { createFakeBackend } from './research/search/fake'
import { createResearchService } from './research/service'
import { openResearchState } from './research/state'
import { bindKbStore, selectionPool } from './retrieve'
import { openKbStore } from './store'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kb-int-')); clearRobotsCache() })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const POSTING = { title: JOB.title, company: JOB.company, location: null, workMode: null, employmentType: null, seniority: 'Senior', salary: null, summary: null, responsibilities: [], requirements: { required: ['React'], preferred: [] }, benefits: [], aboutCompany: null, techStack: JOB.techStack, skills: JOB.skills, fullDescription: null, deadline: null }
const you = (t: string, i: number): TranscriptLine => ({ id: `y${i}`, speaker: 'you', text: t, final: true, t0: 1, t1: 2 })

function world() {
  const store = openKbStore(() => join(dir, 'kb'))
  bindKbStore(store)
  setInterviewPool(jobId => { const items = selectionPool(jobId); return items.length ? { items, skills: store.read(jobId).skills } : null })
  const web = createFakeWeb(); const llm = createFakeLlm()
  const done: Promise<void>[] = []
  const runs = new Map<string, RunRecord>()
  const svc = createResearchService({
    config: () => ({ ...DEFAULT_INTERVIEW_CONFIG, research: { ...DEFAULT_INTERVIEW_CONFIG.research, consentVersion: '1' } }), secret: () => null,
    job: () => ({ title: JOB.title, company: JOB.company, posting: POSTING, gaps: JOB.gaps, cv: CV, userName: JOB.userName }),
    llm: async prompt => { const r = await llm.call(prompt.slice(0, prompt.indexOf('\n\n')), prompt.slice(prompt.indexOf('\n\n') + 2), new AbortController().signal); return { text: r.text, tokens: 1000, model: 'fake' } },
    store: () => store, state: openResearchState(() => join(dir, 'kb'), kbJobDir, web.deps.now), net: web.deps,
    launch: (record: RunStart, work) => {
      const run = { ...record, id: 'run-1', startedAt: 1, endedAt: null, status: 'running', usage: null, log: '' } as RunRecord
      runs.set(run.id, run); done.push(work(t => { run.log += t }, run).then(() => { run.status = 'done' }))
      return run
    },
    getRun: id => runs.get(id), emit: () => undefined, priceCall: () => 0.002, backends: () => [createFakeBackend({ results: () => ALL_RESULTS })],
  })
  const api = createKbApi({ store: () => store, research: () => svc, refreshAfterDays: () => 30, exportDir: () => join(dir, 'x'), changed: () => undefined, now: web.deps.now })
  return { store, svc, api, done }
}

describe('KB integration (fakes)', () => {
  it('research lands in the hashed job folder; the summary reads it back with progress cleared and no spurious "input changed"', async () => {
    const w = world()
    const { runId } = w.svc.start(JOB.jobId, { depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false })
    expect(w.api.kbSummary(JOB.jobId)).toMatchObject({ status: 'running', runId })
    await Promise.all(w.done)
    expect(readdirSync(join(dir, 'kb')).filter(n => !n.startsWith('_'))).toEqual([kbJobDir(JOB.jobId)])
    const s = w.api.kbSummary(JOB.jobId)
    expect(s).toMatchObject({ status: 'complete', inputChanged: false, runId: null })
    expect(s.items).toBeGreaterThan(5)
    expect(w.api.kbList(JOB.jobId).some(i => i.provenance === 'sourced')).toBe(true)
  })

  it('a hidden item leaves the interviewer pool, an edit keeps its stats, and the interviewer writes stats back onto the items', async () => {
    const w = world()
    w.svc.start(JOB.jobId, { depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false })
    await Promise.all(w.done)
    const first = w.api.kbList(JOB.jobId)[0]!
    w.api.kbItemRemove(JOB.jobId, first.id) // a researched item is hidden, not deleted
    expect(interviewPool(JOB.jobId)!.items.map(i => i.id)).not.toContain(first.id)
    expect(w.api.kbList(JOB.jobId, { hidden: true }).map(i => i.id)).toContain(first.id)

    const plan = parsePlan({ mode: 'mixed', minutes: 10, focusSkills: [], difficulty: 'adaptive', includeGenerated: false, persona: { style: 's', seniority: 'senior', strictness: 1, name: 'A' }, voice: { engine: 'system', voiceId: 'Aman', speed: 1 }, echo: 'speakers' })
    const qs: string[] = []
    const iv = createInterview({
      jobId: JOB.jobId, sessionId: 'S', plan, answerMs: 60_000, now: () => 1000,
      complete: scripted([{ when: /Check an interview answer/, reply: '{}' }, { when: /score one spoken/i, reply: JSON.stringify({ criteria: [{ criterion: 'x', score: 4, evidence: '' }] }) }]),
      deps: { pool: interviewPool, recordStats: (jobId, itemId, stats) => { w.store.updateItem(jobId, itemId, i => ({ ...i, stats })) } },
      sink: { question: q => void qs.push(q.id), line: () => undefined, done: () => undefined },
    })
    iv.runner.start()
    await iv.runner.feed(you('hello', 1), true); await vi.waitFor(() => expect(qs).toHaveLength(2))
    await iv.runner.feed(you('I cut the deploy time from 20 to 8 minutes by caching builds', 2), true); await vi.waitFor(() => expect(qs).toHaveLength(3))
    const asked = w.store.read(JOB.jobId).items.find(i => i.id === qs[1])!
    expect(asked.provenance).toBe('sourced') // includeGenerated=false
    expect(asked.id).not.toBe(first.id)
    expect(asked.stats).toMatchObject({ asked: 1, lastScore: 4, avgScore: 4 })
    // a research refresh keeps what practice wrote
    w.svc.start(JOB.jobId, { depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false })
    await Promise.all(w.done)
    expect(w.store.read(JOB.jobId).items.find(i => i.id === asked.id)!.stats).toMatchObject({ asked: 1, avgScore: 4 })
  })
})
