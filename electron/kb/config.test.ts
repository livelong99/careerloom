// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-config-'))
vi.mock('electron', () => ({ app: { getPath: () => dir }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import { DEFAULT_INTERVIEW_CONFIG, normalizeInterviewConfig, readInterviewConfig, writeInterviewConfig } from './config'

const file = path.join(dir, 'interview.json')
beforeEach(() => fs.rmSync(file, { force: true }))
afterEach(() => fs.rmSync(file, { force: true }))

describe('defaults (plan §7, §15)', () => {
  it('match the provisional defaults', () => {
    expect(DEFAULT_INTERVIEW_CONFIG.research).toMatchObject({ model: null, depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false, consentVersion: null, refreshAfterDays: 30 })
    expect(DEFAULT_INTERVIEW_CONFIG.research.search).toEqual({ backend: 'brave', fallbackOrder: ['brave', 'exa', 'serper', 'searxng'], searxngUrl: null })
    expect(Object.values(DEFAULT_INTERVIEW_CONFIG.research.sources).every(Boolean)).toBe(true)
    expect(DEFAULT_INTERVIEW_CONFIG.voice).toEqual({ engine: 'system', voiceId: null, speed: 1, echo: 'speakers', tailMs: 350, pushToInterrupt: 'Control+Alt+I' })
    expect(DEFAULT_INTERVIEW_CONFIG.kb).toEqual({ retentionDays: null, maxItems: 400 })
  })
  it('read returns defaults when the file is missing or corrupt', () => {
    expect(readInterviewConfig()).toEqual(DEFAULT_INTERVIEW_CONFIG)
    fs.writeFileSync(file, '{not json')
    expect(readInterviewConfig()).toEqual(DEFAULT_INTERVIEW_CONFIG)
  })
  it('read does not create the file', () => { readInterviewConfig(); expect(fs.existsSync(file)).toBe(false) })
})

describe('clamping and fallbacks', () => {
  it.each([
    ['budgetUsd low', { research: { budgetUsd: 0 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.research.budgetUsd, 0.05],
    ['budgetUsd high', { research: { budgetUsd: 99 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.research.budgetUsd, 2],
    ['minutes low', { research: { minutes: 0 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.research.minutes, 1],
    ['minutes high', { research: { minutes: 500 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.research.minutes, 20],
    ['speed low', { voice: { speed: 0.1 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.voice.speed, 0.7],
    ['speed high', { voice: { speed: 9 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.voice.speed, 1.3],
    ['tailMs low', { voice: { tailMs: 5 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.voice.tailMs, 150],
    ['tailMs high', { voice: { tailMs: 5000 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.voice.tailMs, 800],
    ['maxItems high', { kb: { maxItems: 10_000 } }, (c: ReturnType<typeof normalizeInterviewConfig>) => c.kb.maxItems, 400],
  ])('%s', (_name, raw, pickField, expected) => expect(pickField(normalizeInterviewConfig(raw))).toBe(expected))

  it('a bad value falls back for that field only', () => {
    const c = normalizeInterviewConfig({ research: { depth: 'ludicrous', budgetUsd: 1, allowAgent: 'yes' }, voice: { engine: 'azure', echo: 'headphones', speed: 'fast' } })
    expect(c.research).toMatchObject({ depth: 'standard', budgetUsd: 1, allowAgent: false })
    expect(c.voice).toMatchObject({ engine: 'system', echo: 'headphones', speed: 1 })
  })
  it('garbage input yields the defaults', () => {
    for (const raw of [null, 7, 'x', [], { research: 5, voice: [], kb: null }]) expect(normalizeInterviewConfig(raw)).toEqual(DEFAULT_INTERVIEW_CONFIG)
  })
  it('search: unknown backends and duplicates are dropped, empty falls back, searxng must be https or loopback', () => {
    const s = (search: unknown) => normalizeInterviewConfig({ research: { search } }).research.search
    expect(s({ backend: 'bing', fallbackOrder: ['exa', 'bing', 'exa', 'serper'] })).toMatchObject({ backend: 'brave', fallbackOrder: ['exa', 'serper'] })
    expect(s({ fallbackOrder: [] }).fallbackOrder).toEqual(['brave', 'exa', 'serper', 'searxng'])
    expect(s({ searxngUrl: 'https://search.example.org/' }).searxngUrl).toBe('https://search.example.org')
    expect(s({ searxngUrl: 'http://localhost:8080' }).searxngUrl).toBe('http://localhost:8080')
    for (const bad of ['http://search.example.org', 'ftp://x.y', 'https://user:pw@x.y', 'not a url', 7]) expect(s({ searxngUrl: bad }).searxngUrl).toBeNull()
  })
  it('sources: only the six groups exist; unknown (e.g. never-fetch hosts) are dropped, non-booleans default on', () => {
    const c = normalizeInterviewConfig({ research: { sources: { hn: false, articles: 'no', linkedin: true, 'reddit.com': true } } })
    expect(Object.keys(c.research.sources).sort()).toEqual(['articles', 'companyPages', 'github', 'hn', 'stackexchange', 'taxonomy'])
    expect(c.research.sources).toMatchObject({ hn: false, articles: true })
  })
  it('nullable fields: retentionDays, model, voiceId, consentVersion', () => {
    const c = normalizeInterviewConfig({ kb: { retentionDays: 30 }, research: { model: 'vendor/model-a', consentVersion: 'v1' }, voice: { voiceId: 'Aman' } })
    expect(c.kb.retentionDays).toBe(30); expect(c.research).toMatchObject({ model: 'vendor/model-a', consentVersion: 'v1' }); expect(c.voice.voiceId).toBe('Aman')
    expect(normalizeInterviewConfig({ kb: { retentionDays: -3 } }).kb.retentionDays).toBeNull()
    expect(normalizeInterviewConfig({ kb: { retentionDays: 1e9 } }).kb.retentionDays).toBeNull()
  })
})

describe('migration', () => {
  it('a partial older file is filled with defaults and unknown keys are dropped', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 1, voice: { speed: 1.2 }, legacy: true, research: { depth: 'deep', extra: 1 } }))
    const c = readInterviewConfig()
    expect(c.voice).toEqual({ ...DEFAULT_INTERVIEW_CONFIG.voice, speed: 1.2 })
    expect(c.research.depth).toBe('deep')
    expect(c).not.toHaveProperty('legacy')
    expect(c.research).not.toHaveProperty('extra')
  })
  it('a newer version number is read as version 1 (fields it does not know are ignored)', () => {
    fs.writeFileSync(file, JSON.stringify({ version: 7, kb: { retentionDays: 14 } }))
    expect(readInterviewConfig()).toMatchObject({ version: 1, kb: { retentionDays: 14 } })
  })
})

describe('write / read round trip', () => {
  it('persists a deep patch and keeps untouched siblings', () => {
    const next = writeInterviewConfig({ research: { depth: 'quick', search: { backend: 'exa' } }, voice: { echo: 'headphones' } })
    expect(next.research.depth).toBe('quick')
    expect(next.research.search).toEqual({ backend: 'exa', fallbackOrder: ['brave', 'exa', 'serper', 'searxng'], searxngUrl: null })
    expect(readInterviewConfig()).toEqual(next)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).version).toBe(1)
  })
  it('clamps on write, sets and clears nullable fields, replaces arrays', () => {
    expect(writeInterviewConfig({ research: { budgetUsd: 50 } }).research.budgetUsd).toBe(2)
    writeInterviewConfig({ kb: { retentionDays: 30 }, research: { search: { fallbackOrder: ['serper', 'exa'] } } })
    expect(readInterviewConfig().kb.retentionDays).toBe(30)
    expect(writeInterviewConfig({ kb: { retentionDays: null }, research: { search: { fallbackOrder: ['exa'] } } })).toMatchObject({ kb: { retentionDays: null }, research: { search: { fallbackOrder: ['exa'] } } })
  })
  it('leaves no temp file behind and writes owner-only', () => {
    writeInterviewConfig({ voice: { speed: 1.1 } })
    expect(fs.readdirSync(dir).filter(f => f.startsWith('interview.json'))).toEqual(['interview.json'])
    expect(fs.statSync(file).mode & 0o077).toBe(0)
  })
})
