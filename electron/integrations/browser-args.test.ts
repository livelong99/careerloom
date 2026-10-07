import { afterEach, describe, expect, it } from 'vitest'

import { playwrightMcp } from './browser-args'

const realPlatform = process.platform
const setPlatform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
afterEach(() => setPlatform(realPlatform))

describe('playwrightMcp launcher', () => {
  it('runs npx directly on posix', () => {
    setPlatform('darwin')
    const m = playwrightMcp('/t/state.json', true, '/t/nav.js')
    expect(m.command).toBe('npx')
    expect(m.args[0]).toBe('-y')
  })
  it('wraps npx in cmd /c on Windows (CLIs spawn MCP servers without a shell, npx is npx.cmd)', () => {
    setPlatform('win32')
    const m = playwrightMcp('C:\\t\\state.json', true, 'C:\\t\\nav.js')
    expect(m.command).toBe('cmd')
    expect(m.args.slice(0, 3)).toEqual(['/c', 'npx', '-y'])
  })
})
