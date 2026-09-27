import { describe, expect, it } from 'vitest'

import type { Application } from '../../lib/types'
import { cumulativeFunnel, hasUnknownDepth } from './funnel'

function app(status: string): Application {
  return { num: 1, date: '2026-06-01', company: 'Acme', via: null, role: 'Engineer', score: null, status, pdf: false, report: null, notes: '' }
}

describe('cumulativeFunnel', () => {
  it('counts a role at every stage it reached, not just its current status', () => {
    const apps = [app('Interview')]
    const stages = cumulativeFunnel(apps)
    expect(stages.map(s => s.count)).toEqual([1, 1, 1, 1, 0]) // evaluated, applied, responded, interview, offer
  })

  it('matches the reported bug: Applied no longer outnumbers Evaluated', () => {
    const apps = [app('Evaluated'), app('Applied'), app('Applied')]
    const stages = cumulativeFunnel(apps)
    const byId = Object.fromEntries(stages.map(s => [s.id, s.count]))
    expect(byId.evaluated).toBe(3)
    expect(byId.applied).toBe(2)
    expect(byId.applied).toBeLessThanOrEqual(byId.evaluated)
  })

  it('counts Hired as having reached Offer', () => {
    const stages = cumulativeFunnel([app('Hired')])
    const byId = Object.fromEntries(stages.map(s => [s.id, s.count]))
    expect(byId.offer).toBe(1)
  })

  it('counts Rejected/Discarded/Skip only toward Evaluated', () => {
    const apps = [app('Rejected'), app('Discarded'), app('SKIP')]
    const stages = cumulativeFunnel(apps)
    const byId = Object.fromEntries(stages.map(s => [s.id, s.count]))
    expect(byId.evaluated).toBe(3)
    expect(byId.applied).toBe(0)
  })

  it('is monotonically non-increasing down the ladder', () => {
    const apps = [app('Evaluated'), app('Applied'), app('Responded'), app('Interview'), app('Offer'), app('Rejected')]
    const counts = cumulativeFunnel(apps).map(s => s.count)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
  })
})

describe('hasUnknownDepth', () => {
  it('is false when every row is on the active ladder', () => {
    expect(hasUnknownDepth([app('Evaluated'), app('Applied'), app('Hired')])).toBe(false)
  })

  it('is true once a row left the pipeline', () => {
    expect(hasUnknownDepth([app('Evaluated'), app('Rejected')])).toBe(true)
  })
})
