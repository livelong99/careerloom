// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ interviewSkillSignal: vi.fn() }))
vi.mock('../../lib/ipc', async orig => ({ ...(await orig<typeof import('../../lib/ipc')>()), careerloom: api }))
vi.mock('./AtsRunner', () => ({ AtsRunner: () => <div>runner</div> }))
vi.mock('../resume/SkillUpSections', () => ({ SkillUpSections: ({ report }: { report: { skillGaps: Array<{ skill: string }> } }) => <ol aria-label="gaps">{report.skillGaps.map(g => <li key={g.skill}>{g.skill}</li>)}</ol> }))

import type { JobAts } from './useJobAts'
import { SkillUpTab } from './SkillUpTab'

const gap = (skill: string) => ({ skill, canonical: skill.toLowerCase(), required: true, bucket: 'gap' as const, howToAdd: '' })
const ats = { report: { match: {}, skillGaps: [gap('Kubernetes'), gap('Go'), gap('Python')], courses: [] }, live: { running: false, questions: [] } } as unknown as JobAts
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SkillUpTab with practice results', () => {
  it('lists practised skills weakest first and puts the gaps you practised worst at the top', async () => {
    api.interviewSkillSignal.mockResolvedValue({ jobId: 'j', at: 1, skills: { go: { avg: 4.2, n: 3 }, python: { avg: 2.1, n: 2 } } })
    render(<SkillUpTab ats={ats} jobId="j" />)
    await screen.findByText('From your practice sessions')
    const chips = screen.getAllByText(/of 5/).map(e => e.textContent)
    expect(chips[0]).toMatch(/^python · 2\.1 of 5 · 2 answers/)
    expect(chips[1]).toMatch(/^go · 4\.2 of 5 · 3 answers/)
    expect(screen.getAllByRole('listitem').map(e => e.textContent).filter(t => !/of 5/.test(t ?? ''))).toEqual(['Python', 'Go', 'Kubernetes'])
  })
  it('shows nothing extra without a signal and keeps the report order', async () => {
    api.interviewSkillSignal.mockResolvedValue(null)
    render(<SkillUpTab ats={ats} jobId="j" />)
    await waitFor(() => expect(api.interviewSkillSignal).toHaveBeenCalledWith('j'))
    expect(screen.queryByText('From your practice sessions')).toBeNull()
    expect(screen.getAllByRole('listitem').map(e => e.textContent)).toEqual(['Kubernetes', 'Go', 'Python'])
  })
})
