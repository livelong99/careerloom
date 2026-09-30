// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-handlers-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import { copilotHandlers } from './handlers'
import { copilotSupported } from './capabilities'

const setPlatform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
const real = process.platform
afterEach(() => setPlatform(real))

describe('copilotHandlers (WP0 stubs)', () => {
  it('registers every CopilotApi method (22 stubs + 2 config)', () => {
    expect(Object.keys(copilotHandlers)).toHaveLength(24)
    expect(Object.keys(copilotHandlers).every(k => k.startsWith('copilot'))).toBe(true)
    expect(Object.keys(copilotHandlers)).toContain('copilotSessionsForJob')
  })
  it('returns a typed not-implemented result on macOS', () => {
    setPlatform('darwin')
    expect(copilotHandlers.copilotStart({})).toEqual({ status: 'not-implemented', method: 'copilotStart' })
  })
  it('refuses every call elsewhere', () => {
    setPlatform('win32')
    expect(copilotSupported()).toBe(false)
    for (const fn of Object.values(copilotHandlers)) expect(() => fn({})).toThrow(/macOS only/)
  })
  it('config round-trips through the handlers and rejects a non-object patch', () => {
    setPlatform('darwin')
    const next = copilotHandlers.copilotSetConfig({ overlay: { anchor: 'bl' } }) as { overlay: { anchor: string } }
    expect(next.overlay.anchor).toBe('bl')
    expect((copilotHandlers.copilotGetConfig() as { overlay: { anchor: string } }).overlay.anchor).toBe('bl')
    expect(() => copilotHandlers.copilotSetConfig('x')).toThrow()
  })
})
