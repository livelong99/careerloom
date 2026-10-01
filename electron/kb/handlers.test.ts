// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const { openExternal, findSource } = vi.hoisted(() => ({ openExternal: vi.fn(), findSource: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {}, shell: { openExternal } }))
vi.mock('./config', () => ({ readInterviewConfig: () => ({ version: 1, from: 'read', research: { refreshAfterDays: 30, search: { backend: 'searxng', searxngUrl: null } } }), writeInterviewConfig: (patch: unknown) => ({ version: 1, from: 'write', patch }) }))
vi.mock('./runtime', () => ({ getKbStore: () => ({ findSource, read: () => ({ manifest: null, items: [], skills: [], sources: [], notes: {} }), revision: () => 0 }) }))
vi.mock('./research/wiring', () => ({ researchService: () => ({ estimate: () => 'est', start: () => ({ runId: 'r1' }), stop: vi.fn(), running: () => null, progress: () => null, inputHash: () => null }) }))
vi.mock('./voice', () => ({ voiceHandlers: () => ({ interviewVoices: async () => ['v'], interviewPreviewVoice: async () => undefined, interviewInstallVoice: async () => ({ runId: 'i1' }) }) }))

import type { Handler } from '../context'
import { kbHandlers as typed } from './handlers'

const kbHandlers: Record<string, Handler> = typed
const platform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
const real = process.platform
afterEach(() => { platform(real); vi.clearAllMocks() })

const ALL = ['kbSummary', 'kbList', 'kbItem', 'kbEstimate', 'kbResearchStart', 'kbResearchStop', 'kbItemUpdate', 'kbItemAdd', 'kbItemRemove', 'kbExport', 'kbImport', 'kbSearchKeyTest', 'kbOpenSource',
  'interviewConfig', 'interviewSetConfig', 'interviewVoices', 'interviewPreviewVoice', 'interviewInstallVoice', 'interviewKokoroStatus', 'interviewSkillSignal', 'interviewPlanPreview']
const MAC = ['interviewVoices', 'interviewPreviewVoice', 'interviewInstallVoice', 'interviewPlanPreview']

describe('kb handlers', () => {
  it('registers exactly the KbApi methods, none a stub', async () => {
    expect(Object.keys(kbHandlers).sort()).toEqual([...ALL].sort())
    for (const name of ALL) await Promise.resolve(kbHandlers[name]!('job-1', {})).then(r => expect(r).not.toMatchObject({ status: 'not-implemented' }), () => undefined)
  })
  it('reads and writes interview.json on every platform', async () => {
    for (const p of ['darwin', 'win32']) {
      platform(p)
      await expect(kbHandlers.interviewConfig!()).resolves.toMatchObject({ from: 'read' })
      await expect(kbHandlers.interviewSetConfig!({ voice: { speed: 1.2 } })).resolves.toMatchObject({ from: 'write' })
    }
  })
  it('research calls validate their arguments first', async () => {
    for (const name of ['kbEstimate', 'kbResearchStart', 'kbResearchStop']) await expect(kbHandlers[name]!(42, {})).rejects.toThrow(/must be a string/)
    await expect(kbHandlers.kbResearchStart!('job-1', {})).resolves.toEqual({ runId: 'r1' })
  })
  it('voice and interviewer calls run on macOS and Windows; Linux keeps the KB only', async () => {
    for (const p of ['darwin', 'win32']) { platform(p); await expect(kbHandlers.interviewVoices!()).resolves.toEqual(['v']) }
    platform('linux')
    for (const name of MAC) await expect(kbHandlers[name]!('job-1', {})).rejects.toThrow(/macOS and Windows only/)
    await expect(kbHandlers.kbList!('job-1')).resolves.toEqual([])
  })
  it('kbOpenSource opens http(s) sources only and says false for an unknown id', async () => {
    findSource.mockReturnValueOnce({ url: 'https://a.dev/x' }).mockReturnValueOnce({ url: 'file:///etc/passwd' }).mockReturnValueOnce(null)
    await expect(kbHandlers.kbOpenSource!('s1')).resolves.toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://a.dev/x')
    await expect(kbHandlers.kbOpenSource!('s2')).resolves.toBe(false)
    await expect(kbHandlers.kbOpenSource!('s3')).resolves.toBe(false)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
  it('kbSearchKeyTest reports a missing SearXNG address instead of throwing', async () => {
    await expect(kbHandlers.kbSearchKeyTest!()).resolves.toEqual({ ok: false, backend: 'searxng' })
  })
})
