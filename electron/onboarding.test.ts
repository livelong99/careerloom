// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import { dirState, nodeVersionOk, parseVersion } from './onboarding'

describe('parseVersion', () => {
  it.each([
    ['v20.11.1\n', '20.11.1'],
    ['10.2.4', '10.2.4'],
    ['git version 2.39.3 (Apple Git-146)', '2.39.3'],
    ['git version 2.45.1.windows.1', '2.45.1'],
    ['command not found', null],
  ])('%s → %s', (out, expected) => expect(parseVersion(out)).toBe(expected))
})

describe('nodeVersionOk', () => {
  it.each([['18.0.0', true], ['22.3.0', true], ['16.20.2', false], ['9.11.2', false], [null, false]] as const)('%s → %s', (v, ok) => {
    expect(nodeVersionOk(v)).toBe(ok)
  })
})

describe('dirState', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-'))
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp) })

  it('missing when nothing is there', () => expect(dirState(path.join(tmp, 'nope'))).toBe('missing'))
  it('empty for an empty folder', () => expect(dirState(tmp)).toBe('empty'))
  it('occupied when other files exist', () => {
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x')
    expect(dirState(tmp)).toBe('occupied')
  })
  it('valid for a career-ops checkout', () => {
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '#')
    fs.mkdirSync(path.join(tmp, 'modes'))
    expect(dirState(tmp)).toBe('valid')
  })
})
