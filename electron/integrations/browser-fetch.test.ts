import os from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))
let open = 0
let peak = 0
vi.mock('../mcp-client', () => ({
  connectMcp: async () => {
    open++; peak = Math.max(peak, open)
    return { call: async () => { await new Promise(r => setTimeout(r, 5)); return '- heading "x"' }, close: () => { open-- } }
  },
}))
const { browserPageText } = await import('./browser-fetch')

describe('browserPageText', () => {
  it('renders one page at a time: a 5k-job queue must not open a Chrome per in-flight fetch', async () => {
    const out = await Promise.all(Array.from({ length: 6 }, (_, i) => browserPageText(`https://www.naukri.com/job-${i}`)))
    expect(out).toHaveLength(6)
    expect(peak).toBe(1)
  })
  it('keeps going after one page fails', async () => {
    await expect(browserPageText('not a url')).rejects.toThrow()
    await expect(browserPageText('https://www.naukri.com/job-9')).resolves.toContain('heading')
  })
})
