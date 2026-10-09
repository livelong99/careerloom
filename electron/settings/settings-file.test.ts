// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ value: '' }))
vi.mock('electron', () => ({ app: { getPath: () => dir.value }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import { readSettings, writeSettings } from '../context'
import { applyPrefsPatch, defaultPrefs, normalizePrefs } from './prefs'

const file = () => path.join(dir.value, 'settings.json')
// What v0.1.1 wrote: no prefs, no keyMeta.
const V011 = { root: '/Users/me/career-ops', runner: 'codex', models: { codex: 'gpt-5' }, helperModels: { claude: 'haiku' } }

beforeEach(() => { dir.value = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-')) })
afterEach(() => fs.rmSync(dir.value, { recursive: true, force: true }))

describe('settings.json migration', () => {
  it('loads a v0.1.1 file unchanged and fills the new fields with defaults', () => {
    fs.writeFileSync(file(), JSON.stringify(V011))
    expect(readSettings()).toEqual({ ...V011, prefs: defaultPrefs(), keyMeta: {}, llm: { helper: null, customBaseUrl: null } })
  })
  it('missing file → defaults; corrupt file → defaults', () => {
    expect(readSettings().runner).toBe('claude')
    fs.writeFileSync(file(), '{not json')
    expect(readSettings()).toEqual({ root: null, runner: 'claude', models: {}, helperModels: {}, prefs: defaultPrefs(), keyMeta: {}, llm: { helper: null, customBaseUrl: null } })
  })
  it('a corrupt file falls back to the last good .bak', () => {
    fs.writeFileSync(file(), JSON.stringify(V011))
    writeSettings({ runner: 'claude' }) // bak = V011
    fs.writeFileSync(file(), '{truncated')
    expect(readSettings().runner).toBe('codex')
  })
  it('drops malformed new fields instead of throwing', () => {
    fs.writeFileSync(file(), JSON.stringify({ ...V011, prefs: { retention: { runLogDays: -5 }, docs: { tone: 'rude' }, updates: 'no' }, keyMeta: { openrouter: { ok: 'yes' }, bogus: {} } }))
    expect(readSettings().prefs).toEqual(defaultPrefs())
    expect(readSettings().keyMeta).toEqual({})
  })
})

describe('writeSettings', () => {
  it('is atomic: no temp file is left behind, previous good file is kept as .bak', () => {
    fs.writeFileSync(file(), JSON.stringify(V011))
    writeSettings({ runner: 'claude' })
    expect(fs.readdirSync(dir.value).sort()).toEqual(['settings.json', 'settings.json.bak'])
    expect(JSON.parse(fs.readFileSync(`${file()}.bak`, 'utf8')).runner).toBe('codex')
  })
  it('preserves fields this version does not know', () => {
    fs.writeFileSync(file(), JSON.stringify({ ...V011, futureThing: { a: 1 } }))
    writeSettings({ runner: 'claude' })
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).futureThing).toEqual({ a: 1 })
  })
  it('does not overwrite a good .bak with a corrupt file', () => {
    fs.writeFileSync(file(), JSON.stringify(V011))
    writeSettings({ runner: 'claude' })
    fs.writeFileSync(file(), '{bad')
    writeSettings({ runner: 'zen' })
    expect(JSON.parse(fs.readFileSync(`${file()}.bak`, 'utf8')).root).toBe(V011.root)
  })
})

describe('prefs', () => {
  it('patches merge and validate', () => {
    const next = applyPrefsPatch(defaultPrefs(), { retention: { runLogDays: 30 }, docs: { tone: 'formal' } })
    expect(next).toMatchObject({ retention: { runLogDays: 30 }, docs: { tone: 'formal', humanize: true } })
    expect(applyPrefsPatch(next, { retention: { runLogDays: null } }).retention.runLogDays).toBeNull()
  })
  it.each([[{ retention: { runLogDays: 0 } }], [{ retention: { runLogDays: 1.5 } }], [{ docs: { tone: 'x' } }], [{ updates: { enabled: 'yes' } }]])('rejects %j', patch => {
    expect(() => applyPrefsPatch(defaultPrefs(), patch)).toThrow()
  })
  it('staged evaluation is off by default, only a real true turns it on, and the patch is validated', () => {
    expect(defaultPrefs().evalPipeline.enabled).toBe(false)
    expect(normalizePrefs({ evalPipeline: { enabled: 'yes' } }).evalPipeline.enabled).toBe(false)
    expect(normalizePrefs({ evalPipeline: { enabled: true } }).evalPipeline.enabled).toBe(true)
    expect(applyPrefsPatch(defaultPrefs(), { evalPipeline: { enabled: true } }).evalPipeline.enabled).toBe(true)
    expect(() => applyPrefsPatch(defaultPrefs(), { evalPipeline: { enabled: 1 } })).toThrow(/true or false/)
  })
  it('normalizePrefs never throws on junk', () => expect(normalizePrefs(42)).toEqual(defaultPrefs()))
})
