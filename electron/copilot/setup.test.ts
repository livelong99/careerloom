import { describe, expect, it } from 'vitest'

import { buildContext } from './setup'
import { parseReport } from '../job-view/reportParse'

const report = parseReport(`# Evaluation: Northwind Labs — Senior Platform Engineer

## F) Interview Plan

### STAR+R Stories

| # | Requirement | Story | S | T | A | R | Reflection |
|---|---|---|---|---|---|---|---|
| 1 | Kubernetes | Cluster migration | s | t | a | r | x |
| 2 | Incident response | Pager storm | s | t | a | r | x |
`)
const CV = '# Ada\n- Led migration of 40 services\n- Cut p99 latency by 35%\n\nSome prose.\n'

describe('buildContext (fallback grounding summary for the Setup tiles)', () => {
  it('counts what the copilot will know and never invents missing parts', () => {
    const { summary, preview } = buildContext({ jobId: 'j', title: 'Senior Platform Engineer', company: 'Northwind Labs', report, posting: { requirements: { required: ['a', 'b'], preferred: ['c'] }, skills: ['x', 'y'], techStack: [], summary: 'Platform role.' }, cv: CV })
    expect(summary).toEqual({ jobId: 'j', title: 'Senior Platform Engineer', company: 'Northwind Labs', hasPosting: true, hasReport: true, hasCv: true, stories: 2 })
    expect(preview).toMatchObject({ posting: 3, facts: 2, stories: 2, strengths: 0, gaps: 0 })
    expect(preview.tokens).toBeGreaterThan(0)
    expect(preview.text).toContain('Cluster migration')
  })
  it('reports absent inputs as absent', () => {
    const { summary, preview } = buildContext({ jobId: 'j', title: 't', company: 'c', report: null, posting: null, cv: null })
    expect(summary).toMatchObject({ hasPosting: false, hasReport: false, hasCv: false, stories: 0 })
    expect(preview).toMatchObject({ posting: 0, facts: 0, stories: 0 })
  })
})
