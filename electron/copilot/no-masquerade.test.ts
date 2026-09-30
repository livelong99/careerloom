import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Scope limit (plan §1, §3.5): no process-name / app-identity disguise may enter electron/** from a port.
const ROOT = path.resolve(__dirname, '..')
const FORBIDDEN = [/process\.title\s*=/, /setAppUserModelId\s*\(/, /\bapp\.setName\s*\(/, /setAppDetails\s*\(/, /setHiddenInMissionControl\s*\(/]
// The one legitimate call: Windows taskbar grouping under the real build.appId (package.json), not a fake identity.
const REAL_APP_ID = (JSON.parse(fs.readFileSync(path.resolve(ROOT, '..', 'package.json'), 'utf8')) as { build: { appId: string } }).build.appId

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p)
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : []
  })
}

describe('no-masquerade guard', () => {
  it('electron/** never changes the process title, app id, app name or hides from Mission Control', () => {
    const hits: string[] = []
    for (const file of sources(ROOT)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return
        for (const re of FORBIDDEN) {
          if (!re.test(line)) continue
          if (/setAppUserModelId/.test(line) && line.includes(`'${REAL_APP_ID}'`)) continue
          hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(hits).toEqual([])
  })

  it('the guard itself detects a disguise (self-check)', () => {
    expect(FORBIDDEN.some(re => re.test("process.title = 'SystemProcess'"))).toBe(true)
    expect(FORBIDDEN.some(re => re.test("app.setAppUserModelId('SystemProcess')"))).toBe(true)
  })
})
