import { describe, expect, it } from 'vitest'

import type { Application } from './careerops'
import { aggregateRuns, computeFindings, localDateKey, type MetricBucket } from './metrics'
import type { RunSummary } from './context'

function run(partial: Partial<RunSummary> & Pick<RunSummary, 'startedAt'>): RunSummary {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    runner: 'claude',
    mode: 'evaluate',
    label: 'Evaluate a job',
    input: null,
    endedAt: partial.startedAt + 1000,
    status: 'done',
    usage: null,
    ...partial,
  }
}

const DAY = 86_400_000
const NOW = Date.UTC(2026, 5, 20, 12) // 2026-06-20 noon UTC — fixed clock for deterministic date keys

describe('localDateKey', () => {
  it('formats a timestamp as a local YYYY-MM-DD key', () => {
    expect(localDateKey(new Date(2026, 5, 1).getTime())).toBe('2026-06-01')
    expect(localDateKey(new Date(2026, 0, 9).getTime())).toBe('2026-01-09')
  })
})

describe('aggregateRuns', () => {
  it('filters to the given range and totals runs/cost/tokens', () => {
    const inWindow = new Date(2026, 5, 10).getTime()
    const outsideWindow = new Date(2026, 5, 1).getTime()
    const history = [
      run({ startedAt: inWindow, usage: { costUsd: 1.5, inputTokens: 100, outputTokens: 50, turns: 1, durationMs: 1000 } }),
      run({ startedAt: outsideWindow, usage: { costUsd: 9, inputTokens: 900, outputTokens: 900, turns: 1, durationMs: 1000 } }),
    ]
    const result = aggregateRuns(history, { from: '2026-06-05', to: '2026-06-15' })
    expect(result.totals.runs).toBe(1)
    expect(result.totals.costUsd).toBe(1.5)
    expect(result.totals.tokens).toBe(150)
  })

  it('groups into byRunner and byMode buckets', () => {
    const t = new Date(2026, 5, 10).getTime()
    const history = [
      run({ startedAt: t, runner: 'claude', mode: 'evaluate' }),
      run({ startedAt: t, runner: 'claude', mode: 'scan' }),
      run({ startedAt: t, runner: 'codex', mode: 'evaluate', status: 'failed' }),
    ]
    const result = aggregateRuns(history, null)
    const claude = result.byRunner.find(b => b.id === 'claude')!
    const codex = result.byRunner.find(b => b.id === 'codex')!
    expect(claude.runs).toBe(2)
    expect(codex.runs).toBe(1)
    expect(codex.failed).toBe(1)
    const evaluate = result.byMode.find(b => b.id === 'evaluate')!
    expect(evaluate.runs).toBe(2)
  })

  it('buckets runs into daily entries keyed by local date, with per-runner counts', () => {
    const day1 = new Date(2026, 5, 10, 9).getTime()
    const day2 = new Date(2026, 5, 11, 9).getTime()
    const history = [run({ startedAt: day1, runner: 'claude' }), run({ startedAt: day1, runner: 'codex' }), run({ startedAt: day2, runner: 'claude' })]
    const result = aggregateRuns(history, null)
    expect(result.daily).toHaveLength(2)
    const first = result.daily.find(d => d.date === '2026-06-10')!
    expect(first.runs).toBe(2)
    expect(first.byRunner).toEqual({ claude: 1, codex: 1 })
  })

  it('computes successRate from done vs failed, excluding cancelled and still-running', () => {
    const t = new Date(2026, 5, 10).getTime()
    const history = [
      run({ startedAt: t, status: 'done' }),
      run({ startedAt: t, status: 'done' }),
      run({ startedAt: t, status: 'failed' }),
      run({ startedAt: t, status: 'cancelled' }),
      run({ startedAt: t, status: 'running', endedAt: null }),
    ]
    const result = aggregateRuns(history, null)
    expect(result.totals.runs).toBe(5)
    expect(result.totals.cancelled).toBe(1)
    expect(result.totals.successRate).toBeCloseTo(2 / 3)
  })
})

function app(partial: Partial<Application>): Application {
  return { num: 1, date: '2026-06-01', company: 'Acme', via: null, role: 'Engineer', score: null, status: 'Evaluated', pdf: false, report: null, notes: '', ...partial }
}

function bucket(partial: Partial<MetricBucket>): MetricBucket {
  return { id: 'claude', runs: 0, failed: 0, costUsd: 0, tokens: 0, durationMs: 0, ...partial }
}

describe('computeFindings', () => {
  const completeProfile = { cv: true, profile: true, portals: true }

  it('flags an incomplete profile with a one-click action to build it', () => {
    const findings = computeFindings({ profile: { cv: false, profile: true, portals: true }, apps: [], pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    const finding = findings.find(f => f.id === 'profile-incomplete')
    expect(finding?.severity).toBe('high')
    expect(finding?.action).toEqual({ kind: 'mode', mode: 'interview', label: 'Build my profile' })
  })

  it('flags 3+ evaluated roles scoring 4+ that are still unapplied', () => {
    const apps = [app({ status: 'Evaluated', score: 4 }), app({ status: 'Evaluated', score: 4.5 }), app({ status: 'Evaluated', score: 5 })]
    const findings = computeFindings({ profile: completeProfile, apps, pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'unapplied-matches')?.action).toEqual({ kind: 'navigate', section: 'jobs', label: 'Review jobs' })
  })

  it('does not flag unapplied matches below the threshold', () => {
    const apps = [app({ status: 'Evaluated', score: 4 }), app({ status: 'Evaluated', score: 4 })]
    const findings = computeFindings({ profile: completeProfile, apps, pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'unapplied-matches')).toBeUndefined()
  })

  it('flags a stale or missing scan', () => {
    const never = computeFindings({ profile: completeProfile, apps: [], pipelineBacklog: 0, lastScanAt: null, now: NOW, byRunner: [], byMode: [] })
    expect(never.find(f => f.id === 'scan-stale')?.action).toEqual({ kind: 'mode', mode: 'scan', label: 'Scan portals' })

    const stale = computeFindings({ profile: completeProfile, apps: [], pipelineBacklog: 0, lastScanAt: NOW - 8 * DAY, now: NOW, byRunner: [], byMode: [] })
    expect(stale.find(f => f.id === 'scan-stale')).toBeDefined()

    const fresh = computeFindings({ profile: completeProfile, apps: [], pipelineBacklog: 0, lastScanAt: NOW - 1 * DAY, now: NOW, byRunner: [], byMode: [] })
    expect(fresh.find(f => f.id === 'scan-stale')).toBeUndefined()
  })

  it('flags a pipeline backlog over the threshold', () => {
    const findings = computeFindings({ profile: completeProfile, apps: [], pipelineBacklog: 6, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'pipeline-backlog')?.action).toEqual({ kind: 'mode', mode: 'pipeline', label: 'Process inbox' })
  })

  it('flags a low average fit score over at least 5 evaluations', () => {
    const apps = Array.from({ length: 5 }, () => app({ score: 3 }))
    const findings = computeFindings({ profile: completeProfile, apps, pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'low-fit-average')).toBeDefined()
  })

  it('does not flag low fit average below 5 evaluations', () => {
    const apps = Array.from({ length: 4 }, () => app({ score: 3 }))
    const findings = computeFindings({ profile: completeProfile, apps, pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'low-fit-average')).toBeUndefined()
  })

  it('flags a runner with a high failure rate over at least 3 runs', () => {
    const findings = computeFindings({
      profile: completeProfile, apps: [], pipelineBacklog: 0, lastScanAt: NOW, now: NOW,
      byRunner: [bucket({ id: 'codex', runs: 4, failed: 2 })], byMode: [],
    })
    expect(findings.find(f => f.id === 'runner-failures-codex')?.action).toEqual({ kind: 'navigate', section: 'settings', label: 'Check settings' })
  })

  it('flags applied roles with no update in 7+ days', () => {
    const staleDate = new Date(NOW - 8 * DAY).toISOString().slice(0, 10)
    const apps = [app({ status: 'Applied', date: staleDate })]
    const findings = computeFindings({ profile: completeProfile, apps, pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'followups-due')?.action).toEqual({ kind: 'mode', mode: 'followup', label: 'Check follow-ups' })
  })

  it('flags 3+ rejections', () => {
    const apps = [app({ status: 'Rejected' }), app({ status: 'Rejected' }), app({ status: 'Rejected' })]
    const findings = computeFindings({ profile: completeProfile, apps, pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })
    expect(findings.find(f => f.id === 'rejection-patterns')?.action).toEqual({ kind: 'mode', mode: 'patterns', label: 'Find patterns' })
  })

  it('flags a high average cost per evaluation', () => {
    const findings = computeFindings({
      profile: completeProfile, apps: [], pipelineBacklog: 0, lastScanAt: NOW, now: NOW,
      byRunner: [], byMode: [bucket({ id: 'evaluate', runs: 2, costUsd: 2 })],
    })
    expect(findings.find(f => f.id === 'high-eval-cost')?.action).toEqual({ kind: 'navigate', section: 'settings', label: 'Try the API runner' })
  })

  it('sorts findings by severity, high first', () => {
    const apps = [app({ status: 'Rejected' }), app({ status: 'Rejected' }), app({ status: 'Rejected' })]
    const findings = computeFindings({
      profile: { cv: false, profile: true, portals: true }, apps, pipelineBacklog: 6, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [],
    })
    const severities = findings.map(f => f.severity)
    expect(severities).toEqual([...severities].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a] - { high: 0, medium: 1, low: 2 }[b])))
  })

  it('returns no findings for a healthy, empty account', () => {
    expect(computeFindings({ profile: completeProfile, apps: [], pipelineBacklog: 0, lastScanAt: NOW, now: NOW, byRunner: [], byMode: [] })).toEqual([])
  })
})
