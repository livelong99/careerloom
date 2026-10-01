import { describe, expect, it } from 'vitest'

import { EMPTY_FILTER, elapsedMs, filterRuns, kindOf, logSteps, moveSelection, runLinks, runTotals } from './runsView'
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
  const jobs = [{ id: 'j1', url: 'https://x.test/1', reportNum: 7 }, { id: 'j2', url: 'https://x.test/2', reportNum: null }]
  it('finds the job by the posting link', () => expect(runLinks(run({ mode: 'evaluate', input: ' https://x.test/2 ' }), jobs).jobId).toBe('j2'))
  it('finds the job by report number for report modes only', () => {
    expect(runLinks(run({ mode: 'pdf', input: '7' }), jobs)).toMatchObject({ jobId: 'j1', resume: true })
    expect(runLinks(run({ mode: 'evaluate', input: '7' }), jobs).jobId).toBeNull()
  })
  it('points scans at Boards and nothing at setup runs', () => {
    expect(runLinks(run({ mode: 'scan' }), jobs)).toEqual({ jobId: null, resume: false, boards: true })
    expect(runLinks(run({ mode: 'setup' }), jobs)).toEqual({ jobId: null, resume: false, boards: false })
  })
})
