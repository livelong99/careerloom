import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { debugLog, debugLogDir, formatLine, setDebugLogDir } from './debug-log'

const dirs: string[] = []
const tmp = (): string => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-debug-')); dirs.push(d); return d }
afterEach(() => { setDebugLogDir(null); for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })
const lines = (d: string): Array<Record<string, unknown>> => fs.readdirSync(d).flatMap(f => fs.readFileSync(path.join(d, f), 'utf8').trim().split('\n')).map(l => JSON.parse(l))

describe('debug log', () => {
  it('writes nothing until a folder is set, then appends JSON lines and stops on null', () => {
    const d = tmp()
    debugLog('x', 'before')
    expect(fs.readdirSync(d)).toEqual([])
    setDebugLogDir(d)
    debugLog('copilot', 'answer start', { id: 'q1' })
    setDebugLogDir(null)
    debugLog('x', 'after')
    expect(lines(d).map(l => l.msg)).toEqual(['log started', 'answer start', 'log stopped'])
    expect(debugLogDir()).toBeNull()
  })
  it('masks secret-looking keys and sk- strings, keeps promptTokens, serialises errors', () => {
    const l = JSON.parse(formatLine('t', 'm', { apiKey: 'abc', Authorization: 'Bearer z', promptTokens: 12, note: 'key sk-or-v1-abcdef1234567890', err: new Error('boom') }))
    expect(l.data).toMatchObject({ apiKey: '[hidden]', Authorization: '[hidden]', promptTokens: 12, note: 'key sk-…', err: { message: 'boom' } })
  })
  it('masks Bearer tokens, key-in-URL params and other providers\' key shapes inside free text', () => {
    const l = JSON.parse(formatLine('t', 'm', { err: 'GET https://x.test/v1?key=AIzaSyABCDEF123456&q=1 401 Authorization: Bearer abc.def-123', fc: 'fc-0123456789abcdef0123', refreshToken: 'r', refresh_token: 'r2', clientSecret: 's', maxTokens: 3 }))
    expect(JSON.stringify(l)).not.toMatch(/AIzaSy|abc\.def|fc-0123|"r"|"r2"|"s"/)
    expect(l.data.maxTokens).toBe(3)
  })
  it('truncates huge lines', () => { expect(formatLine('t', 'm', { x: 'a'.repeat(20000) }).length).toBeLessThan(6200) })
  it('refuses a missing folder so Settings can say why', () => {
    expect(() => setDebugLogDir(path.join(tmp(), 'nope'))).toThrow()
    expect(debugLogDir()).toBeNull()
  })
})
