// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import { GOLDEN_POOL, GOLDEN_SKILLS } from './fixtures/golden-kb'
import { interviewPlanPreview } from './handlers'
import { interviewPool, setInterviewPool } from './pool'

const plan = { mode: 'mixed', minutes: 30, focusSkills: [], difficulty: 'adaptive', includeGenerated: true, persona: { style: 's', seniority: 'senior', strictness: 3, name: 'A' }, voice: { engine: 'system', voiceId: 'Aman', speed: 1 }, echo: 'speakers' }
const real = process.platform
const platform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
afterEach(() => { platform(real); setInterviewPool(() => null) })

describe('interviewPlanPreview', () => {
  it('previews from the registered pool', async () => {
    platform('darwin'); setInterviewPool(() => ({ items: GOLDEN_POOL, skills: GOLDEN_SKILLS }))
    expect(await interviewPlanPreview('job-1', plan)).toMatchObject({ questions: 8, minutes: 30 })
  })
  it('says what to do when the job has no question base', async () => {
    platform('darwin')
    await expect(interviewPlanPreview('job-1', plan)).rejects.toThrow(/Knowledge base/)
  })
  it('rejects a bad plan or job id, and is refused off macOS and Windows', async () => {
    platform('darwin'); setInterviewPool(() => ({ items: GOLDEN_POOL, skills: [] }))
    await expect(interviewPlanPreview('job-1', { ...plan, mode: 'x' })).rejects.toThrow()
    await expect(interviewPlanPreview(7, plan)).rejects.toThrow()
    platform('linux')
    await expect(interviewPlanPreview('job-1', plan)).rejects.toThrow(/macOS and Windows only/)
  })
  it('the default pool is empty', () => expect(interviewPool('x')).toBeNull())
})
