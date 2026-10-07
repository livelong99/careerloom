// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ value: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => dir.value, getVersion: () => '0.3.0', on: () => {}, getName: () => 'careerloom', getLocale: () => 'en-US', getAppPath: () => '/app', isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openPath: async () => '' },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`enc:${s}`), decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '') },
}))

import { readSettings } from '../context'
import { debugLogDir, setDebugLogDir } from '../debug-log'
import { settingsHandlers as h } from './handlers'
import { setKey } from './keys'

const logText = (d: string) => fs.readdirSync(d).map(f => fs.readFileSync(path.join(d, f), 'utf8')).join('\n')
let logs = ''
beforeEach(() => { dir.value = fs.mkdtempSync(path.join(os.tmpdir(), 'dbgh-')); logs = fs.mkdtempSync(path.join(os.tmpdir(), 'dbgh-logs-')) })
afterEach(() => { setDebugLogDir(null); fs.rmSync(dir.value, { recursive: true, force: true }); fs.rmSync(logs, { recursive: true, force: true }) })

describe('prefsSet › debug.dir (Settings → Advanced → Debug log)', () => {
  it('a missing/unwritable folder is refused and NOT persisted (logging stays off)', () => {
    expect(() => h.prefsSet!({ debug: { dir: path.join(logs, 'nope') } })).toThrow(/existing folder/)
    expect(readSettings().prefs.debug.dir).toBeNull()
    expect(debugLogDir()).toBeNull()
  })
  it('a bad folder keeps the previous good one running', () => {
    h.prefsSet!({ debug: { dir: logs } })
    expect(() => h.prefsSet!({ debug: { dir: path.join(logs, 'nope') } })).toThrow()
    expect(readSettings().prefs.debug.dir).toBe(logs)
    expect(debugLogDir()).toBe(logs)
  })
  it('on: starts, writes a snapshot with no saved key in it; off: stops; the folder (only) can be revealed', async () => {
    const SECRET = 'sk-or-v1-SENTINELdebugsecret000111'
    setKey('openrouter', SECRET)
    h.prefsSet!({ debug: { dir: logs } })
    expect(debugLogDir()).toBe(logs)
    await expect(h.revealPath!(logs)).resolves.toBe(true)
    await expect(h.revealPath!(os.tmpdir())).rejects.toThrow(/Not a data location/)
    h.prefsSet!({ debug: { dir: null } })
    expect(debugLogDir()).toBeNull()
    const text = logText(logs)
    expect(text).toMatch(/log started/)
    expect(text).toMatch(/log stopped/)
    expect(text).not.toContain('SENTINELdebugsecret')
    expect(readSettings().prefs.debug.dir).toBeNull()
  })
})
