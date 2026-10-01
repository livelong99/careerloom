import { describe, expect, it, vi } from 'vitest'

import type { PwCookie } from '../integrations/browser-cookies'
import { FastBlocked, FastFallback, fastExtract, type FastDeps } from './driver'
import type { Page } from './page'

const card = (n: number) => ({ title: `Backend Engineer ${n}`, company: `Acme ${n}`, location: 'Bengaluru', url: `https://www.linkedin.com/jobs/view/${n}/` })

/** A scripted page: `pages[url]` is the list of reads it returns as it is scrolled (last one repeats). */
function fakePage(pages: Record<string, { reads: unknown[][]; wall?: string | null; looks?: boolean; href?: string }>) {
  let cur = ''
  let reads = 0
  const calls = { navigate: [] as string[], scroll: 0, closed: false }
  const page: Page = {
    navigate: async u => { cur = u; reads = 0; calls.navigate.push(u) },
    scroll: async () => { calls.scroll++; reads++ },
    url: async () => pages[cur]?.href ?? cur,
    html: async () => '<html></html>',
    close: () => { calls.closed = true },
    evaluate: (async (expr: string) => {
      const p = pages[cur]!
      if (expr.includes('wallReason')) return p.wall ?? null
      if (expr.includes('.length > 0')) return p.looks ?? true
      return p.reads[Math.min(reads, p.reads.length - 1)]
    }) as Page['evaluate'],
  }
  return { page, calls }
}

function deps(page: Page, over: Partial<FastDeps> = {}) {
  const closed = { browser: false }
  const d: FastDeps = {
    findBrowser: () => '/bin/chrome', launch: async () => ({ wsUrl: 'ws://x', close: () => { closed.browser = true } }),
    open: async () => page, sleep: async () => {}, random: () => 0, ...over,
  }
  return { d, closed }
}
const opts = (over = {}) => ({ domain: 'linkedin.com', urls: ['https://www.linkedin.com/jobs/search/?keywords=x'], cookies: [] as PwCookie[], headless: true, settleSeconds: 0, log: vi.fn(), ...over })

describe('fastExtract', () => {
  it('scrolls until the list stops growing, paginates by URL, and closes everything', async () => {
    const { page, calls } = fakePage({
      'https://www.linkedin.com/jobs/search/?keywords=x': { reads: [[card(1)], [card(1), card(2)], [card(1), card(2)]] },
      'https://www.linkedin.com/jobs/search/?keywords=x&start=25': { reads: [[card(3)]] },
      'https://www.linkedin.com/jobs/search/?keywords=x&start=50': { reads: [[card(3)]] }, // nothing new: past the end
    })
    const { d, closed } = deps(page)
    const o = opts()
    const jobs = await fastExtract(o, d)
    expect(jobs.map(j => j.title)).toEqual(['Backend Engineer 1', 'Backend Engineer 2', 'Backend Engineer 3'])
    expect(calls.navigate).toHaveLength(3)
    expect(calls.closed && closed.browser).toBe(true)
    expect(o.log.mock.calls.map(c => c[0]).join('')).toContain('page 1/3 → 2 new jobs (linkedin)')
  })

  it('pauses between pages at a human pace', async () => {
    const { page } = fakePage({
      'https://www.linkedin.com/jobs/search/?keywords=x': { reads: [[card(1)]] },
      'https://www.linkedin.com/jobs/search/?keywords=x&start=25': { reads: [[card(2)]] },
      'https://www.linkedin.com/jobs/search/?keywords=x&start=50': { reads: [[card(3)]] },
    })
    const sleeps: number[] = []
    await fastExtract(opts(), deps(page, { sleep: async ms => { sleeps.push(ms) }, random: () => 0.5 }).d)
    expect(sleeps).toContain(5500) // 3000 + 0.5 × 5000
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(8000)
  })

  it('stops on a login wall with FastBlocked (no fallback to an agent)', async () => {
    const { page, calls } = fakePage({ 'https://www.linkedin.com/jobs/search/?keywords=x': { reads: [[]], wall: 'redirected to /authwall' } })
    const { d, closed } = deps(page)
    await expect(fastExtract(opts(), d)).rejects.toBeInstanceOf(FastBlocked)
    expect(calls.closed && closed.browser).toBe(true)
  })

  it('keeps earlier pages when a later page hits a wall', async () => {
    const { page } = fakePage({
      'https://www.linkedin.com/jobs/search/?keywords=x': { reads: [[card(1)]] },
      'https://www.linkedin.com/jobs/search/?keywords=x&start=25': { reads: [[]], wall: 'page says "captcha"' },
    })
    const o = opts()
    expect((await fastExtract(o, deps(page).d)).length).toBe(1)
    expect(o.log.mock.calls.map(c => c[0]).join('')).toContain('stopped at page 2')
  })

  it('falls back (FastFallback) when nothing can be read, with the browser still cleaned up', async () => {
    const { page, calls } = fakePage({ 'https://www.linkedin.com/jobs/search/?keywords=x': { reads: [[]] } })
    const { d, closed } = deps(page)
    await expect(fastExtract(opts(), d)).rejects.toBeInstanceOf(FastFallback)
    expect(calls.closed && closed.browser).toBe(true)
  })

  it('falls back when no Chrome/Edge is installed', async () => {
    const { page } = fakePage({})
    await expect(fastExtract(opts(), deps(page, { findBrowser: () => null }).d)).rejects.toThrow(/no Chrome or Edge/)
  })

  it('turns an unexpected browser error into a fallback and still closes the browser', async () => {
    const { page } = fakePage({})
    const { d, closed } = deps(page, { open: async () => { throw new Error('ws exploded') } })
    await expect(fastExtract(opts(), d)).rejects.toThrow(FastFallback)
    expect(closed.browser).toBe(true)
  })

  it('uses the listed URLs as pages for a board with no known site', async () => {
    const a = 'https://jobs.example.com/a', b = 'https://jobs.example.com/b'
    const row = (n: number) => ({ title: `Dev ${n}`, company: 'X', location: 'Y', url: `https://jobs.example.com/j/${n}` })
    const { page, calls } = fakePage({ [a]: { reads: [[row(1)]] }, [b]: { reads: [[row(2)]] } })
    const jobs = await fastExtract(opts({ domain: 'example.com', urls: [a, b] }), deps(page).d)
    expect(calls.navigate).toEqual([a, b])
    expect(jobs).toHaveLength(2)
  })
})
