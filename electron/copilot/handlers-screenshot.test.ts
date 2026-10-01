// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-handlers-shot-'))
vi.mock('electron', () => ({
  app: { getPath: () => dir }, BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {}, shell: { openExternal: vi.fn() }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
}))

import { createCopilot, type CopilotDeps } from './handlers'

const setPlatform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
const real = process.platform
beforeEach(() => setPlatform('darwin'))
afterEach(() => setPlatform(real))

function setup(over: Partial<CopilotDeps> = {}) {
  const base = fs.mkdtempSync(path.join(dir, 'c-'))
  return createCopilot({
    dir: () => base, job: () => null, cv: () => '', permission: () => 'granted', hasKey: () => true, sttInstalled: () => true,
    call: async () => ({ text: '{}', tokens: 1, model: 'fake' }), ...over,
  })
}

describe('copilotScreenshot / screenshot cleanup', () => {
  it('delegates to the wired screenshot flow without waiting for the answer', async () => {
    let finish!: () => void
    const screenshot = vi.fn(() => new Promise<void>(r => { finish = r }))
    const c = setup({ screenshot })
    await expect(c.handlers.copilotScreenshot()).resolves.toBeUndefined()
    expect(screenshot).toHaveBeenCalledTimes(1)
    finish()
  })
  it('a failure inside the flow never rejects the IPC call', async () => {
    const c = setup({ screenshot: async () => { throw new Error('boom') } })
    await expect(c.handlers.copilotScreenshot()).resolves.toBeUndefined()
  })
  it('stays a typed not-implemented stub when nothing is wired', async () => {
    expect(await setup().handlers.copilotScreenshot()).toEqual({ status: 'not-implemented', method: 'copilotScreenshot' })
  })
  it('deleting a session (or all) wipes held screenshots', async () => {
    const clearScreenshots = vi.fn()
    const c = setup({ clearScreenshots })
    await c.handlers.copilotDeleteSession('all')
    await c.handlers.copilotDeleteSession('some-session')
    expect(clearScreenshots).toHaveBeenCalledTimes(2)
  })
})
