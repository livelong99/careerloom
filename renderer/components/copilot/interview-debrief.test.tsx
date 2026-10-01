// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AXES, heatRows, weakestEvidence } from './heatmap'

const api = vi.hoisted(() => ({ kbList: vi.fn(), kbSummary: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import type { QuestionResult, SessionDetail } from '@/lib/types'
import { InterviewDebrief } from './InterviewDebrief'

const crit = (s: number[], ev = ['', '', '', '']) => AXES.map((a, i) => ({ criterion: a, score: s[i]! as 1, evidence: ev[i]! }))
const R = (itemId: string, score: number | null, over: Partial<QuestionResult> = {}): QuestionResult => ({ itemId, score, criteria: score === null ? [] : crit([4, 3, 2, 5], ['', '', 'we did it', '']), hintUsed: false, skipped: false, ...over })

describe('heatRows', () => {
  it('averages each axis per label, sorted, and leaves skipped or unscored answers out', () => {
    const rows = heatRows([R('a', 4), { ...R('b', 3), criteria: crit([2, 3, 4, 1]) }, R('c', null), R('d', 5, { skipped: true })], id => (id === 'a' || id === 'b' ? ['Kafka', 'Python'] : ['Other']))
    expect(rows.map(r => r.label)).toEqual(['Kafka', 'Python'])
    expect(rows[0]!.cells).toEqual([3, 3, 3, 3])
  })
  it('a criterion that was not scored is null, not zero', () => {
    const rows = heatRows([{ ...R('a', 3), criteria: [{ criterion: 'structure', score: 4, evidence: '' }] }], () => ['X'])
    expect(rows[0]!.cells).toEqual([4, null, null, null])
  })
  it('weakestEvidence picks the lowest-scoring criterion that has a quote', () => {
    expect(weakestEvidence(R('a', 4))).toEqual({ criterion: 'Evidence', evidence: 'we did it' })
    expect(weakestEvidence(R('a', null))).toBeNull()
  })
})

const session = (over: Partial<SessionDetail> = {}): SessionDetail => ({
  id: 's', startedAt: 1, endedAt: 2, mode: 'practice', jobId: 'j1', jobTitle: 't', company: 'c', questions: 2, durationSec: 60, score: 3, transcript: [], suggestions: [], scorecard: null,
  questionsList: [{ id: 'k1', text: 'What Kafka guarantees would you rely on?', type: 'technical', confidence: 1, at: 0, auto: false }],
  interview: { planHash: 'h', itemIds: ['k1', 'k2'], perQuestion: [R('k1', 4), R('k2', null, { skipped: true, hintUsed: true })] }, ...over,
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('InterviewDebrief', () => {
  it('lists each question with its quote, score, origin and hint use; the heat map shows a number in every cell', async () => {
    api.kbList.mockResolvedValue([{ id: 'k1', text: 'x', skills: ['kafka'], provenance: 'sourced' }])
    api.kbSummary.mockResolvedValue({ coverage: [{ skillId: 'kafka', name: 'Kafka' }] })
    render(<InterviewDebrief session={session()} />)
    expect(await screen.findByText('Sourced')).toBeTruthy()
    expect(screen.getByText(/“we did it” \(Evidence\)/)).toBeTruthy()
    expect(screen.getByText(/Skipped · hint used/)).toBeTruthy()
    const map = screen.getByRole('table')
    expect(within(map).getByRole('rowheader', { name: 'Kafka' })).toBeTruthy()
    expect(within(map).getAllByRole('cell').map(c => c.textContent)).toEqual(['4.0', '3.0', '2.0', '5.0'])
    expect(screen.getByText(/rough AI estimates/)).toBeTruthy()
  })
  it('without a question base it still works, labelling rows by the question', async () => {
    api.kbList.mockResolvedValue({ status: 'not-implemented', method: 'kbList' })
    api.kbSummary.mockRejectedValue(new Error('x'))
    render(<InterviewDebrief session={session()} />)
    expect(await screen.findByRole('rowheader', { name: /What Kafka guarantees/ })).toBeTruthy()
    expect(screen.queryByText('Sourced')).toBeNull()
  })
  it('renders nothing for a session without interviewer results', () => {
    api.kbList.mockResolvedValue([]); api.kbSummary.mockResolvedValue(null)
    const { container } = render(<InterviewDebrief session={session({ interview: undefined })} />)
    expect(container.textContent).toBe('')
  })
})
