import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { agyDenied, agyProject, ensureAgyProject } from './agy-project'
import { argsForPrompt } from './runner'

describe('agy project', () => {
  it('grants only the workspace, skills, node/npm-run and web reads', () => {
    const p = agyProject('/w/career-ops', ['/s/skill']) as { permissionGrants: { permissionGrants: { allow: string[] } } }
    expect(p.permissionGrants.permissionGrants.allow).toEqual([
      'read_file(/w/career-ops)', 'write_file(/w/career-ops)', 'read_file(/s/skill)', 'command(node)', 'command(npm run)', 'read_url(*)',
    ])
  })
  it('writes the project file once and returns its id', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-agy-'))
    expect(ensureAgyProject('/w', [], home)).toBe('careerloom')
    const file = path.join(home, '.gemini', 'config', 'projects', 'careerloom.json')
    const first = fs.statSync(file).mtimeMs
    ensureAgyProject('/w', [], home)
    expect(fs.statSync(file).mtimeMs).toBe(first)
  })
  it('runs agy inside that project with edits accepted', () => {
    expect(argsForPrompt('antigravity', '/career-ops x', { agyProject: 'careerloom' }).args).toEqual(['-p', '/career-ops x', '--project', 'careerloom', '--mode', 'accept-edits', '--sandbox', '--dangerously-skip-permissions', '--output-format', 'stream-json'])
    expect(argsForPrompt('antigravity', '/career-ops x', { agyProject: '--evil' }).args).toEqual(['-p', '/career-ops x', '--output-format', 'stream-json'])
  })
  it('spots headless denials that still exit 0', () => {
    expect(agyDenied('jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for')).toBe(true)
    expect(agyDenied('all good')).toBe(false)
  })
})
