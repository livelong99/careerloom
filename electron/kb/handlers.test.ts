// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import type { Handler } from '../context'
import { kbHandlers as typed } from './handlers'

const kbHandlers: Record<string, Handler> = typed

const KB = ['kbSummary', 'kbList', 'kbItem', 'kbEstimate', 'kbResearchStart', 'kbResearchStop', 'kbItemUpdate', 'kbItemAdd', 'kbItemRemove', 'kbExport', 'kbImport', 'kbSearchKeyTest', 'kbOpenSource']
const VOICE = ['interviewVoices', 'interviewPreviewVoice', 'interviewInstallVoice']
const platform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
const real = process.platform
afterEach(() => platform(real))

describe('kb handler stubs (WP0)', () => {
  it('registers exactly the KbApi methods', () => expect(Object.keys(kbHandlers).sort()).toEqual([...KB, ...VOICE, 'interviewPlanPreview'].sort())) // plan preview is real (KB-WP4)
  it.each(KB)('%s resolves not-implemented on every platform', async name => {
    for (const p of ['darwin', 'win32', 'linux']) {
      platform(p)
      await expect(kbHandlers[name]!('job-1', {})).resolves.toEqual({ status: 'not-implemented', method: name })
    }
  })
  it.each(VOICE)('%s is not-implemented on macOS', async name => {
    platform('darwin')
    await expect(kbHandlers[name]!('system', 'Aman', 1)).resolves.toEqual({ status: 'not-implemented', method: name })
  })
  it.each(VOICE)('%s is refused off macOS', async name => {
    for (const p of ['win32', 'linux']) {
      platform(p)
      await expect(kbHandlers[name]!()).rejects.toThrow(/macOS only/)
    }
  })
})
