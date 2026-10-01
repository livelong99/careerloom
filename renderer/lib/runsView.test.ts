import { describe, expect, it } from 'vitest'

import { EMPTY_FILTER, elapsedMs, filterRuns, groupRuns, indexJobs, kindOf, logSteps, moveSelection, runLinks, runTotals } from './runsView'
import type { Run } from './types'

const DAY = 86_400_000
const NOW = new Date('2026-10-01T12:00:00').getTime()
const run = (o: Partial<Run>): Run => ({ id: 'r', runner: 'claude', mode: 'evaluate', label: 'Evaluate a job', input: null, startedAt: NOW - 1000, endedAt: NOW, status: 'done', ...o })

const runs: Run[] = [
  run({ id: 'a', status: 'running', endedAt: null, startedAt: NOW - 5000 }),
  run({ id: 'b', status: 'failed', mode: 'scan', label: 'Scan portals', runner: 'codex', usage: { costUsd: 0.5, inputTokens: 100, outputTokens: 50, turns: 2, durationMs: 10 } }),
  run({ id: 'c', status: 'cancelled', mode: 'pdf', startedAt: NOW - 3 * DAY, input: 'Acme staff role' }),
  run({ id: 'd', status: 'done', mode: 'web-board', runner: 'zen', startedAt: NOW - 40 * DAY }),
]
const ids = (f: Partial<typeof EMPTY_FILTER>) => filterRuns(runs, { ...EMPTY_FILTER, ...f }, NOW).map(r => r.id)

describe('kindOf', () => {
  it.each([['evaluate', 'evaluate'], ['pipeline', 'evaluate'], ['scan', 'scan'], ['web-board', 'scan'], ['pdf', 'resume'], ['intake', 'resume'], ['practice', 'copilot'], ['live', 'copilot'], ['skill-install', 'setup'], ['setup', 'setup'], ['patterns', 'agent']])('%s → %s', (mode, kind) => {
    expect(kindOf(run({ mode }))).toBe(kind)
  })
})

describe('filterRuns', () => {
  it('returns everything by default', () => expect(ids({})).toEqual(['a', 'b', 'c', 'd']))
  it('filters by status', () => { expect(ids({ status: 'failed' })).toEqual(['b']); expect(ids({ status: 'running' })).toEqual(['a']) })
  it('filters by runner and kind', () => { expect(ids({ runner: 'codex' })).toEqual(['b']); expect(ids({ kind: 'scan' })).toEqual(['b', 'd']) })
  it('filters by date range', () => { expect(ids({ range: 'today' })).toEqual(['a', 'b']); expect(ids({ range: '7d' })).toEqual(['a', 'b', 'c']); expect(ids({ range: '30d' })).toEqual(['a', 'b', 'c']) })
  it('searches label, input and mode case-insensitively', () => { expect(ids({ q: 'ACME' })).toEqual(['c']); expect(ids({ q: 'scan' })).toEqual(['b']) })
  it('combines filters', () => expect(ids({ kind: 'scan', status: 'done' })).toEqual(['d']))
})

describe('runTotals', () => {
  it('counts today, failures, tokens and spend', () => {
    expect(runTotals(runs, NOW)).toEqual({ today: 2, running: 1, failed: 1, tokens: 150, costUsd: 0.5 })
  })
})

describe('moveSelection', () => {
  const l = ['a', 'b', 'c']
  it('moves and clamps', () => {
    expect(moveSelection(l, 'a', 1)).toBe('b')
    expect(moveSelection(l, 'c', 1)).toBe('c')
    expect(moveSelection(l, 'a', -1)).toBe('a')
  })
  it('starts at the first row when nothing is selected', () => expect(moveSelection(l, null, 1)).toBe('a'))
  it('supports home/end and an empty list', () => { expect(moveSelection(l, 'b', 'end')).toBe('c'); expect(moveSelection(l, 'b', 'start')).toBe('a'); expect(moveSelection([], null, 1)).toBeNull() })
})

describe('elapsedMs', () => {
  it('uses now for running runs', () => expect(elapsedMs(runs[0]!, NOW)).toBe(5000))
  it('uses endedAt for finished runs', () => expect(elapsedMs(runs[1]!, NOW + 99)).toBe(1000))
})

describe('logSteps', () => {
  it('lists tool calls and the outcome with their line numbers', () => {
    expect(logSteps('hello\n▸ Read cv.md\nthinking\n▸ Bash node scan.mjs\n✓ done · $0.10')).toEqual([
      { line: 1, text: 'Read cv.md', kind: 'tool' },
      { line: 3, text: 'Bash node scan.mjs', kind: 'tool' },
      { line: 4, text: 'done · $0.10', kind: 'ok' },
    ])
  })
  it('marks failures', () => expect(logSteps('✗ failed')[0]?.kind).toBe('fail'))
})

describe('runLinks', () => {
  it('links the job, and resume modes to the Resume workspace', () => expect(runLinks(run({ mode: 'pdf' }), { id: 'j1' })).toEqual({ jobId: 'j1', resume: true, boards: false }))
  it('points scans at Boards and nothing at setup runs', () => {
    expect(runLinks(run({ mode: 'scan' }), null)).toEqual({ jobId: null, resume: false, boards: true })
    expect(runLinks(run({ mode: 'setup' }), null)).toEqual({ jobId: null, resume: false, boards: false })
  })
})

const J = (o: { id: string; url: string; title: string; company: string; reportNum?: number | null }) => ({ reportNum: null, ...o })
const jobs = [
  J({ id: 'j1', url: 'https://x.test/1', title: 'Staff Engineer', company: 'Acme', reportNum: 7 }),
  J({ id: 'j2', url: 'https://x.test/2', title: 'SRE', company: 'Globex' }),
]
const jobOf = indexJobs(jobs)

describe('indexJobs (which job a run belongs to)', () => {
  it('prefers the job id stamped on the run', () => expect(jobOf(run({ mode: 'job-view', label: 'Structure job posting', jobId: 'j2', input: 'https://x.test/1' }))?.id).toBe('j2'))
  it('falls back to the posting link (evaluate)', () => expect(jobOf(run({ mode: 'evaluate', input: ' https://x.test/1 ' }))?.id).toBe('j1'))
  it('falls back to the report number for report modes (tailored CV, cover letter)', () => {
    expect(jobOf(run({ mode: 'pdf', input: '7' }))?.id).toBe('j1')
    expect(jobOf(run({ mode: 'evaluate', input: '7' }))).toBeNull()
  })
  it('reads company and title from an older evaluate run\'s label', () => {
    expect(jobOf(run({ mode: 'evaluate', label: 'Evaluate Globex — SRE (2/3)', input: null }))?.id).toBe('j2')
  })
  it('is null for runs with no job: scans, setup, chat, ats/doc runs without a job id', () => {
    for (const mode of ['scan', 'setup', 'chat', 'ats', 'job-view']) expect(jobOf(run({ mode, label: 'x', input: null }))).toBeNull()
  })
  it('is null when the job is gone from the list (no crash, no wrong match)', () => {
    expect(jobOf(run({ mode: 'job-view', jobId: 'deleted', input: null }))).toBeNull()
    expect(jobOf(run({ mode: 'evaluate', input: 'https://x.test/none' }))).toBeNull()
  })
})

describe('job filter and search', () => {
  const rs = [run({ id: 'a', mode: 'evaluate', input: 'https://x.test/1' }), run({ id: 'b', mode: 'job-view', jobId: 'j2' }), run({ id: 'c', mode: 'scan', label: 'Scan portals' })]
  const idsOf = (f: Partial<typeof EMPTY_FILTER>) => filterRuns(rs, { ...EMPTY_FILTER, ...f }, NOW, jobOf).map(r => r.id)
  it('filters to one job, or to runs with no job', () => { expect(idsOf({ job: 'j2' })).toEqual(['b']); expect(idsOf({ job: 'none' })).toEqual(['c']) })
  it('searches the job title and company', () => { expect(idsOf({ q: 'globex' })).toEqual(['b']); expect(idsOf({ q: 'staff' })).toEqual(['a']) })
})

describe('groupRuns', () => {
  const mk = (id: string, startedAt: number, o: Partial<Run> = {}) => run({ id, startedAt, ...o })
  const rs = [
    mk('old-eval', 100, { mode: 'evaluate', input: 'https://x.test/1' }),
    mk('scan', 500, { mode: 'scan', label: 'Scan portals' }),
    mk('cv', 300, { mode: 'pdf', input: '7' }),
    mk('sre', 400, { mode: 'job-view', jobId: 'j2', status: 'failed' }),
  ]
  it('none: one group, input order', () => expect(groupRuns(rs, 'none', jobOf).map(g => g.runs.map(r => r.id))).toEqual([['old-eval', 'scan', 'cv', 'sre']]))
  it('job: a timeline per job (oldest first), newest job first, runs without a job last', () => {
    const g = groupRuns(rs, 'job', jobOf)
    expect(g.map(x => x.key)).toEqual(['j2', 'j1', 'none'])
    expect(g[1]!.runs.map(r => r.id)).toEqual(['old-eval', 'cv'])
    expect(g[1]!.title).toBe('Staff Engineer — Acme')
    expect(g[2]!.title).toBe('No job')
  })
  it('status: running, failed, cancelled, done in that order, empty groups dropped', () => {
    expect(groupRuns([...rs, mk('r', 1, { status: 'running' })], 'status', jobOf).map(g => g.key)).toEqual(['running', 'failed', 'done'])
  })
})
