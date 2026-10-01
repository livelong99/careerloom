// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-config-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import { defaultEngine } from './stt/runtime'
import { DEFAULT_CONFIG, normalizeConfig, readCopilotConfig, writeCopilotConfig } from './config'

const file = path.join(dir, 'copilot.json')
beforeEach(() => fs.rmSync(file, { force: true }))
afterEach(() => fs.rmSync(file, { force: true }))

describe('defaults (plan §7)', () => {
  it('are answer-on-demand, OpenRouter deny, 90-day retention, privacy mode off', () => {
    expect(DEFAULT_CONFIG.engine).toMatchObject({ tier: 'fast', provider: 'openrouter', autoAnswer: false, escalateForDesignCoding: true })
    expect(DEFAULT_CONFIG.engine.openrouter.dataCollection).toBe('deny')
    expect(DEFAULT_CONFIG.privacy.retentionDays).toBe(90)
    expect(DEFAULT_CONFIG.privacy.redact).toBe(true)
    expect(DEFAULT_CONFIG.privacy.mode).toMatchObject({ enabled: false, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' })
    expect(DEFAULT_CONFIG.coaching.shape).toBe('cues+star')
    expect(DEFAULT_CONFIG.overlay).toMatchObject({ anchor: 'tr', width: 440, opacity: 0.94 })
    expect(DEFAULT_CONFIG.stt).toMatchObject({ engine: defaultEngine(), language: 'en', endSilenceMs: 650 })
    expect(DEFAULT_CONFIG.hotkeys.quickHide).toBe('Control+Alt+Shift+H')
    expect(DEFAULT_CONFIG.hotkeys.panic).toBe('Control+Alt+Shift+X')
  })
  it('read returns defaults when the file is missing or corrupt', () => {
    expect(readCopilotConfig()).toEqual(DEFAULT_CONFIG)
    fs.writeFileSync(file, '{not json')
    expect(readCopilotConfig()).toEqual(DEFAULT_CONFIG)
  })
})

describe('write / read round trip', () => {
  it('persists a deep patch and keeps untouched siblings', () => {
    const next = writeCopilotConfig({ engine: { tier: 'deep', openrouter: { zdr: true } }, overlay: { anchor: 'bl' } })
    expect(next.engine.tier).toBe('deep')
    expect(next.engine.openrouter).toEqual({ dataCollection: 'deny', zdr: true, sort: 'latency' })
    expect(readCopilotConfig()).toEqual(next)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(1)
  })
  it('can set and clear nullable fields', () => {
    writeCopilotConfig({ privacy: { retentionDays: null }, engine: { models: { fast: 'vendor/model-a' } } })
    expect(readCopilotConfig().privacy.retentionDays).toBeNull()
    expect(readCopilotConfig().engine.models.fast).toBe('vendor/model-a')
    writeCopilotConfig({ engine: { models: { fast: null } } })
    expect(readCopilotConfig().engine.models.fast).toBeNull()
  })
  it('replaces arrays instead of merging', () => {
    writeCopilotConfig({ stt: { vocab: ['Kubernetes', 'Kafka'] } })
    expect(writeCopilotConfig({ stt: { vocab: ['Rust'] } }).stt.vocab).toEqual(['Rust'])
  })
  it('leaves no temp file behind', () => {
    writeCopilotConfig({ overlay: { fontPx: 15 } })
    expect(fs.readdirSync(dir).filter(f => f.startsWith('copilot.json'))).toEqual(['copilot.json'])
  })
})

describe('schema validation', () => {
  it('rejects bad values per field and keeps the good ones', () => {
    const c = normalizeConfig({
      engine: { tier: 'turbo', autoAnswer: true, models: { fast: 7, deep: 'a/b' } },
      overlay: { anchor: 'nowhere', width: 99999, opacity: 0.1, fontPx: 'big', displayId: 2 },
      privacy: { retentionDays: -5, redact: 'yes' },
      stt: { engine: 'whisper-mlx', endSilenceMs: 5, language: 'fr', vocab: ['ok', 3, ''] },
      coaching: { length: 9, shape: 'script' },
    })
    expect(c.engine.tier).toBe('fast')
    expect(c.engine.autoAnswer).toBe(true)
    expect(c.engine.models).toEqual({ fast: null, balanced: null, deep: 'a/b' })
    expect(c.overlay.anchor).toBe('tr')
    expect(c.overlay.width).toBeLessThanOrEqual(1200)
    expect(c.overlay.opacity).toBe(0.6)
    expect(c.overlay.fontPx).toBe(DEFAULT_CONFIG.overlay.fontPx)
    expect(c.overlay.displayId).toBe(2)
    expect(c.privacy.retentionDays).toBe(90)
    expect(c.privacy.redact).toBe(true)
    expect(c.stt.engine).toBe('whisper-mlx')
    expect(c.stt.language).toBe('en')
    expect(c.stt.endSilenceMs).toBe(200)
    expect(c.stt.vocab).toEqual(['ok'])
    expect(c.coaching.length).toBe(DEFAULT_CONFIG.coaching.length)
    expect(c.coaching.shape).toBe('script')
  })
  it('the panic hotkey is fixed', () => {
    expect(normalizeConfig({ hotkeys: { panic: 'Control+Q', answer: 'Control+Alt+Z' } }).hotkeys).toMatchObject({ panic: 'Control+Alt+Shift+X', answer: 'Control+Alt+Z' })
  })
  it('non-object input gives defaults', () => {
    for (const bad of [null, 'x', 42, [], undefined]) expect(normalizeConfig(bad)).toEqual(DEFAULT_CONFIG)
  })
  it('setConfig with a non-object patch is rejected by the handler layer (see handlers), and unknown keys are dropped', () => {
    const c = normalizeConfig({ evil: 1, overlay: { extra: true } })
    expect(c).toEqual(DEFAULT_CONFIG)
  })
})

describe('migration safety', () => {
  it('reads a file from an older/newer version without throwing, and rewrites as version 1', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 0, overlay: { anchor: 'bl' }, legacyField: 1 }))
    expect(readCopilotConfig().overlay.anchor).toBe('bl')
    fs.writeFileSync(file, JSON.stringify({ version: 7, engine: { tier: 'balanced' }, futureThing: {} }))
    const next = writeCopilotConfig({})
    expect(next.engine.tier).toBe('balanced')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty('futureThing')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(1)
  })
  it('an engine that cannot run on this build (faster-whisper) falls back to the default instead of failing every session start', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, stt: { engine: 'faster-whisper', model: 'small' } }))
    expect(readCopilotConfig().stt.engine).toBe(defaultEngine())
    expect(writeCopilotConfig({ stt: { engine: 'faster-whisper' } }).stt.engine).toBe(defaultEngine())
  })
  it('a partial file (fields added in later releases) fills missing sections from defaults', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, audio: { useSystem: true } }))
    const c = readCopilotConfig()
    expect(c.audio.useSystem).toBe(true)
    expect(c.audio.systemSource).toBe('loopback')
    expect(c.practice).toEqual(DEFAULT_CONFIG.practice)
  })
})
