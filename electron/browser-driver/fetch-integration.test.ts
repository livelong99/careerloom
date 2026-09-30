import { beforeEach, describe, expect, it, vi } from 'vitest'

const fast = vi.hoisted(() => ({ fn: vi.fn() }))
const zenRuns = vi.hoisted(() => ({ count: 0 }))

vi.mock('./driver', async orig => ({ ...(await orig<typeof import('./driver')>()), fastExtract: fast.fn }))
vi.mock('../context', () => ({
  careerOpsRoot: () => '/tmp/none', launch: vi.fn(), readOpencodeKey: () => null, readSettings: () => ({ runner: 'zen', models: {} }), streamFormat: () => 'text',
  startZen: (_r: unknown, _p: unknown, o: { onExit: (r: unknown) => void }) => { zenRuns.count++; o.onExit({ status: 'done', log: '{"jobs":[{"title":"Agent Job","url":"https://www.linkedin.com/jobs/view/9/"}]}' }) },
}))
vi.mock('../integrations/browser-login', () => ({
  domainCookies: async () => [{ name: 'a', value: 'SECRET', domain: '.linkedin.com', path: '/', expires: 0, httpOnly: true, secure: true, sameSite: 'Lax' }],
  effectiveLogin: () => ({ source: 'chrome', profile: 'Default', headless: true }), fastBrowserEnabled: () => true,
  isAcknowledged: () => true, loginLabel: () => 'Chrome · Default', pageWaitSeconds: () => 3,
}))

import { FastBlocked, FastFallback } from './driver'
import { browserExtract } from '../integrations/browser-fetch'

const board = { name: 'LinkedIn', careers_url: 'https://www.linkedin.com/jobs/search/?keywords=x', fetch: 'browser' } as never
const job = { title: 'Fast Job', url: 'https://www.linkedin.com/jobs/view/1/', company: '', location: '', posted_at: null, salary: null, employment_type: null, remote: null, description_snippet: '' }
let logs: string[]
beforeEach(() => { fast.fn.mockReset(); zenRuns.count = 0; logs = [] })
const log = (t: string) => logs.push(t)

describe('browserExtract: fast path first, agent as fallback', () => {
  it('returns the fast driver\'s jobs without starting the agent', async () => {
    fast.fn.mockResolvedValue([job])
    expect(await browserExtract(board, undefined, log)).toEqual([job])
    expect(zenRuns.count).toBe(0)
    expect(fast.fn.mock.calls[0]![0]).toMatchObject({ domain: 'linkedin.com', headless: true, settleSeconds: 3 })
  })

  it('falls back to the agent, logging why, when the fast path cannot read the page', async () => {
    fast.fn.mockRejectedValue(new FastFallback('no job cards could be read from the page'))
    const jobs = await browserExtract(board, undefined, log)
    expect(jobs.map(j => j.title)).toEqual(['Agent Job'])
    expect(zenRuns.count).toBe(1)
    expect(logs.join('')).toContain('fast browser fell back to the agent: no job cards could be read from the page')
  })

  it('a login wall stops the scan with the actionable message and does not start the agent', async () => {
    fast.fn.mockRejectedValue(new FastBlocked('redirected to /authwall'))
    await expect(browserExtract(board, undefined, log)).rejects.toThrow(/Linkedin asked you to sign in \(redirected to \/authwall\).*1 cookie from Chrome · Default/)
    expect(zenRuns.count).toBe(0)
  })

  it('never logs cookie values', async () => {
    fast.fn.mockResolvedValue([job])
    await browserExtract(board, undefined, log)
    expect(logs.join('')).not.toContain('SECRET')
    expect(logs.join('')).toContain('Loaded 1 cookie for linkedin.com')
  })
})
