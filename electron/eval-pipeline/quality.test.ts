import { describe, expect, it } from 'vitest'

import { candidate, fakeFetch, fakeLlm, synthJobs } from './fakes'
import { agreement } from './quality'
import { runPipeline } from './run'
import type { JobResult } from './types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const r = (jobId: string, fate: JobResult['fate'], stage: JobResult['stage'], fit?: number): JobResult => ({ jobId, fate, stage, reason: '', local: null, light: fit === undefined ? null : { fit, decision: 'Consider', archetype: '', summary: '', strengths: [], gaps: [], hardStop: null } })

describe('agreement', () => {
  it('computes agreement, kappa, missed/false-alarm rates and early drops by hand-checkable counts', () => {
    const labels = [{ jobId: 'a', ref: 4.5 }, { jobId: 'b', ref: 4.0 }, { jobId: 'c', ref: 2 }, { jobId: 'd', ref: 1.5 }, { jobId: 'e', ref: 4.2 }, { jobId: 'f', ref: 3 }]
    const results = [r('a', 'deep', 'llm', 4.4), r('b', 'light', 'llm', 3.0), r('c', 'light', 'llm', 3.9), r('d', 'skip', 'score'), r('e', 'skip', 'filter'), r('f', 'failed', 'llm')]
    const a = agreement(results, labels)
    // tp: a; fn: b, e; fp: c; tn: d; f unjudged
    expect(a).toMatchObject({ n: 6, judged: 5, unjudged: 1, droppedEarly: 1, missedRate: 0.667, falseAlarmRate: 0.5, agreement: 0.4 })
    expect(a.kappa).toBeCloseTo(-0.154, 2)
    expect(a.maeFit).toBeCloseTo((0.1 + 1.0 + 1.9) / 3, 2)
  })
  it('is perfect on identical verdicts and handles an empty sample', () => {
    expect(agreement([r('a', 'light', 'llm', 4), r('b', 'light', 'llm', 2)], [{ jobId: 'a', ref: 4 }, { jobId: 'b', ref: 2 }])).toMatchObject({ agreement: 1, kappa: 1, missedRate: 0 })
    expect(agreement([], [])).toMatchObject({ judged: 0, agreement: 0 })
  })
})

describe('pipeline vs the oracle on 1000 synthetic jobs', () => {
  it('keeps agreement high and loses few positives to the deterministic stages', async () => {
    const world = synthJobs(1000, 42)
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-q-'))
    const out = await runPipeline(world, { runId: 'q', runDir: path.join(base, 'runs', 'q'), candidate: candidate(), fetchJd: fakeFetch(world), llm: fakeLlm(world, { noise: 0.4 }), write: null })
    const unique = new Map(out.results.map(x => [x.jobId, x]))
    const labels = world.filter(j => unique.get(j.id)?.dupOf === undefined).map(j => ({ jobId: j.id, ref: j.truth }))
    const a = agreement(out.results, labels)
    expect(a.unjudged).toBe(0)
    expect(a.agreement).toBeGreaterThan(0.93); expect(a.kappa).toBeGreaterThan(0.85)
    expect(a.missedRate).toBeLessThan(0.15) // misses are near-threshold 'adjacent' jobs: the fake model's ±0.4 noise straddles 3.5
    expect(a.droppedEarly).toBeLessThanOrEqual(Math.ceil(0.03 * labels.filter(l => l.ref >= 3.5).length))
  })
})
